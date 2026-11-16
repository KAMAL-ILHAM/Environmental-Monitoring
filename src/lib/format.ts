import type { RangeKey } from "./types";

const dateTimeFormat = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export const formatDateTime = (iso: string) => dateTimeFormat.format(new Date(iso));

export function formatAxisTick(ts: number, range: RangeKey): string {
  const d = new Date(ts);
  if (range === "7d" || range === "30d") {
    return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
  }
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

export function formatAge(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  if (s < 5) return "baru saja";
  if (s < 60) return `${s} detik lalu`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} menit lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  return `${Math.floor(h / 24)} hari lalu`;
}

export function fmt(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("id-ID", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtCoord(value: number): string {
  return value.toLocaleString("id-ID", { minimumFractionDigits: 6, maximumFractionDigits: 6 });
}
