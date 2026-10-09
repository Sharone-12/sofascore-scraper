"use client"

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  ResponsiveContainer,
} from "recharts"
import { PLAYER_COLORS } from "@/lib/stats"

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

const fmt = (v: number) =>
  Number.isInteger(v) ? String(v) : v.toFixed(v < 10 ? 2 : 1)

export function StatBarChart({
  data,
  players,
}: {
  data: Record<string, string | number>[]
  players: string[]
}) {
  return (
    <div className="space-y-3">
      {data.map((row) => {
        const vals = players.map((p) => Number(row[p]) || 0)
        const max = Math.max(...vals, 0.01)

        return (
          <div key={row.stat as string}>
            <div className="text-[0.7rem] text-[oklch(0.55_0_0)] uppercase tracking-wider mb-1.5">
              {row.stat}
            </div>
            <div className="space-y-1">
              {players.map((name, i) => {
                const v = vals[i]
                const pct = (v / max) * 100
                return (
                  <div key={name} className="flex items-center gap-2">
                    <div className="flex-1 h-[10px] rounded-full overflow-hidden bg-white/[0.04]">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.max(pct, 1)}%`,
                          background: PLAYER_COLORS[i % PLAYER_COLORS.length],
                          opacity: v === max && players.length > 1 ? 0.9 : 0.45,
                        }}
                      />
                    </div>
                    <span
                      className="text-xs tabular-nums font-medium w-10 text-right shrink-0"
                      style={{
                        color: v === max && players.length > 1
                          ? PLAYER_COLORS[i % PLAYER_COLORS.length]
                          : "oklch(0.55 0 0)",
                      }}
                    >
                      {fmt(v)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {players.length > 1 && (
        <div className="flex items-center gap-4 pt-2 border-t border-white/[0.04]">
          {players.map((name, i) => (
            <div key={name} className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: PLAYER_COLORS[i % PLAYER_COLORS.length] }}
              />
              <span className="text-[0.65rem] text-[oklch(0.6_0_0)] truncate">{name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
