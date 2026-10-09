"use client"

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
} from "recharts"
import { PLAYER_COLORS } from "@/lib/stats"

const TOOLTIP_STYLE = {
  backgroundColor: "oklch(0.19 0.042 257)",
  border: "1px solid oklch(1 0 0 / 12%)",
  borderRadius: "0.75rem",
  color: "oklch(0.95 0 0)",
  fontSize: 12,
  padding: "8px 12px",
  boxShadow: "0 8px 24px oklch(0 0 0 / 40%)",
} as const

export function PlayerRadar({
  data,
  players,
  domain,
}: {
  data: Record<string, string | number>[]
  players: string[]
  domain?: [number, number] | "auto"
}) {
  const resolvedDomain: [number, number] = domain === "auto"
    ? [0, Math.ceil(Math.max(...data.flatMap((row) => players.map((p) => Number(row[p]) || 0))) * 1.15) || 1]
    : domain ?? [0, 100]

  return (
    <ResponsiveContainer width="100%" height={350}>
      <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
        <PolarGrid stroke="oklch(1 0 0 / 8%)" />
        <PolarAngleAxis
          dataKey="stat"
          tick={{ fill: "oklch(0.65 0 0)", fontSize: 12 }}
        />
        <PolarRadiusAxis
          angle={90}
          domain={resolvedDomain}
          tick={domain === "auto" ? false : { fill: "oklch(0.5 0 0)", fontSize: 10 }}
          tickCount={5}
        />
        {players.map((name, i) => (
          <Radar
            key={name}
            name={name}
            dataKey={name}
            stroke={PLAYER_COLORS[i % PLAYER_COLORS.length]}
            fill={PLAYER_COLORS[i % PLAYER_COLORS.length]}
            fillOpacity={0.15}
            strokeWidth={2}
          />
        ))}
        {players.length > 1 && <Legend />}
      </RadarChart>
    </ResponsiveContainer>
  )
}

/**
 * Each row is scaled to the largest value in that row, not to one axis shared
 * by every row. Possession (68) and Accurate Passes (600) used to sit on the
 * same 0-800 scale, which rendered possession as an invisible sliver and made
 * it look like the data was missing. Bars show relative size; the real number
 * is printed on the bar and in the tooltip, so nothing is lost.
 */
const NORM = "__n"

function normalise(
  data: Record<string, string | number>[],
  players: string[],
): Record<string, string | number>[] {
  return data.map((row) => {
    const max = Math.max(
      ...players.map((p) => Math.abs(Number(row[p]) || 0)),
      0,
    )
    const out: Record<string, string | number> = { ...row }
    for (const p of players) {
      const v = Number(row[p]) || 0
      out[p + NORM] = max ? (v / max) * 100 : 0
    }
    return out
  })
}

const fmt = (v: number) =>
  Number.isInteger(v) ? String(v) : v.toFixed(v < 10 ? 2 : 1)

export function StatBarChart({
  data,
  players,
}: {
  data: Record<string, string | number>[]
  players: string[]
}) {
  // With a single series every row would normalise to 100%, which says nothing,
  // so one player keeps the plain absolute axis.
  const scaled = players.length > 1
  const rows = scaled ? normalise(data, players) : data

  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 36)}>
      <BarChart
        data={rows}
        layout="vertical"
        margin={{ left: 0, right: scaled ? 44 : 16, top: 4, bottom: 4 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="oklch(1 0 0 / 6%)"
          horizontal={false}
        />
        <XAxis
          type="number"
          domain={scaled ? [0, 118] : undefined}
          hide={scaled}
          tick={{ fill: "oklch(0.65 0 0)", fontSize: 11 }}
          axisLine={false}
        />
        <YAxis
          type="category"
          dataKey="stat"
          width={130}
          tick={{ fill: "oklch(0.65 0 0)", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          cursor={{ fill: "oklch(1 0 0 / 4%)" }}
          formatter={(value, name, item) => {
            const key = String(name)
            const raw = item?.payload?.[key]
            return [fmt(Number(raw ?? value) || 0), key]
          }}
        />
        {players.map((name, i) => (
          <Bar
            key={name}
            dataKey={scaled ? name + NORM : name}
            name={name}
            fill={PLAYER_COLORS[i % PLAYER_COLORS.length]}
            radius={[0, 4, 4, 0]}
            barSize={players.length > 1 ? 12 : 18}
          >
            {scaled && (
              <LabelList
                dataKey={name}
                position="right"
                fontSize={10}
                fill="oklch(0.70 0 0)"
                formatter={(v: unknown) => fmt(Number(v) || 0)}
              />
            )}
          </Bar>
        ))}
        {players.length > 1 && <Legend />}
      </BarChart>
    </ResponsiveContainer>
  )
}

