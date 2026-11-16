"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmt, formatAxisTick, formatDateTime } from "@/lib/format";
import type { RangeKey } from "@/lib/types";
import { EmptyState } from "./ui";

type Datum = { ts: number; value: number };

type Props = {
  title: string;
  unit: string;
  color: string;
  gradientId: string;
  data: Datum[];
  range: RangeKey;
  yDomain: [(dataMin: number) => number, (dataMax: number) => number];
};

function ChartTooltip({
  active,
  payload,
  unit,
  title,
}: {
  active?: boolean;
  payload?: { payload: Datum }[];
  unit: string;
  title: string;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="text-slate-500">{formatDateTime(new Date(point.ts).toISOString())}</p>
      <p className="mt-0.5 font-semibold text-slate-900">
        {title}: {fmt(point.value, 1)} {unit}
      </p>
    </div>
  );
}

export function SensorChart({ title, unit, color, gradientId, data, range, yDomain }: Props) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-slate-700">
        {title} <span className="text-slate-400">({unit})</span>
      </h3>

      {data.length === 0 ? (
        <EmptyState title="Belum ada data pada rentang ini">
          Grafik hanya menampilkan data aktual dari ESP32 yang tersimpan di database.
        </EmptyState>
      ) : (
        <div className="h-60 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="ts"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(v: number) => formatAxisTick(v, range)}
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={false}
                minTickGap={48}
              />
              <YAxis
                domain={yDomain}
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={false}
                width={44}
              />
              <Tooltip content={<ChartTooltip unit={unit} title={title} />} cursor={{ stroke: "#cbd5e1" }} />
              <Area
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                dot={data.length <= 2 ? { r: 3, fill: color } : false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
