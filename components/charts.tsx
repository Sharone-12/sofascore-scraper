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
        <PolarGrid stroke="hsl(var(--border))" />
        <PolarAngleAxis
          dataKey="stat"
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
        />
        <PolarRadiusAxis
          angle={90}
          domain={[0, 100]}
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
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
          stroke="hsl(var(--border))"
          horizontal={false}
        />
        <XAxis
          type="number"
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
          axisLine={false}
        />
        <YAxis
          type="category"
          dataKey="stat"
          width={130}
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "0.5rem",
            color: "hsl(var(--popover-foreground))",
            fontSize: 12,
          }}
        />
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
