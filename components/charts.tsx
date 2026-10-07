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
}: {
  data: Record<string, string | number>[]
  players: string[]
}) {
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
          domain={[0, 100]}
          tick={{ fill: "oklch(0.5 0 0)", fontSize: 10 }}
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

export function StatBarChart({
  data,
  players,
}: {
  data: Record<string, string | number>[]
  players: string[]
}) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 36)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ left: 0, right: 16, top: 4, bottom: 4 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="oklch(1 0 0 / 6%)"
          horizontal={false}
        />
        <XAxis
          type="number"
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
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "oklch(1 0 0 / 4%)" }} />
        {players.map((name, i) => (
          <Bar
            key={name}
            dataKey={name}
            fill={PLAYER_COLORS[i % PLAYER_COLORS.length]}
            radius={[0, 4, 4, 0]}
            barSize={players.length > 1 ? 12 : 18}
          />
        ))}
        {players.length > 1 && <Legend />}
      </BarChart>
    </ResponsiveContainer>
  )
}
