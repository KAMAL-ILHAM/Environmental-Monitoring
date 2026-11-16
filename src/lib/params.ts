import { isRangeKey, type RangeKey } from "./types";

/** Mengembalikan deviceId yang valid, atau null jika kosong/tidak valid. */
export function parseDeviceId(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return /^[A-Za-z0-9._:-]{1,64}$/.test(trimmed) ? trimmed : null;
}

export function parseRange(value: string | null): RangeKey {
  return isRangeKey(value) ? value : "24h";
}

export function parseIntParam(value: string | null, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
