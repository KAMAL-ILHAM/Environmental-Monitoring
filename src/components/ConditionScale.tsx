import { classify, scalePosition, type Scale, type Tone } from "@/lib/status";
import { fmt } from "@/lib/format";
import { Badge } from "./ui";

const segmentColor: Record<Tone, string> = {
  info: "bg-sky-400",
  good: "bg-emerald-400",
  warn: "bg-amber-400",
  danger: "bg-rose-500",
  muted: "bg-slate-300",
};

/** Bar indikator kondisi dengan penanda posisi nilai aktual. Tanpa nilai → bar kosong. */
export function ConditionScale({ title, scale, value }: { title: string; scale: Scale; value: number | null }) {
  const span = scale.max - scale.min;
  const current = value == null ? null : classify(value, scale);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-700">{title}</span>
        {current ? <Badge tone={current.tone}>{current.label}</Badge> : <Badge tone="muted">Belum ada data</Badge>}
      </div>

      <div className="relative pt-1.5">
        <div className="flex h-2.5 w-full overflow-hidden rounded-full">
          {scale.segments.map((seg, i) => {
            const from = i === 0 ? scale.min : scale.segments[i - 1].to;
            return (
              <div
                key={seg.label}
                className={`${value == null ? "bg-slate-200" : segmentColor[seg.tone]} ${i > 0 ? "border-l border-white" : ""}`}
                style={{ width: `${((seg.to - from) / span) * 100}%` }}
                title={`${seg.label}: ${from}–${seg.to} ${scale.unit}`}
              />
            );
          })}
        </div>

        {value != null && (
          <div
            className="absolute top-0 -translate-x-1/2 transition-[left] duration-500"
            style={{ left: `${scalePosition(value, scale) * 100}%` }}
            aria-label={`Nilai saat ini ${fmt(value)} ${scale.unit}`}
          >
            <div className="h-5 w-1 rounded-full bg-slate-900 ring-2 ring-white" />
          </div>
        )}
      </div>

      <div className="mt-2 flex justify-between text-[11px] text-slate-400">
        <span>
          {scale.min} {scale.unit}
        </span>
        <span>
          {scale.max} {scale.unit}
        </span>
      </div>

      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
        {scale.segments.map((seg, i) => {
          const from = i === 0 ? null : scale.segments[i - 1].to;
          const range =
            from == null ? `< ${seg.to}` : i === scale.segments.length - 1 ? `≥ ${from}` : `${from}–${seg.to}`;
          return (
            <li key={seg.label} className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${segmentColor[seg.tone]}`} />
              {seg.label} <span className="text-slate-400">({range})</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
