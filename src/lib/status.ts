// Ambang batas indikator kondisi. Ini hanya acuan klasifikasi untuk nilai yang diukur sensor
// (bukan data); sesuaikan dengan kebutuhan ruangan/lingkungan Anda.

export type Tone = "info" | "good" | "warn" | "danger" | "muted";

export type ScaleSegment = {
  /** Batas atas (eksklusif) segmen ini */
  to: number;
  label: string;
  tone: Tone;
};

export type Scale = {
  min: number;
  max: number;
  unit: string;
  segments: ScaleSegment[];
};

export const TEMPERATURE_SCALE: Scale = {
  min: 10,
  max: 45,
  unit: "°C",
  segments: [
    { to: 18, label: "Dingin", tone: "info" },
    { to: 28, label: "Nyaman", tone: "good" },
    { to: 33, label: "Hangat", tone: "warn" },
    { to: 45, label: "Panas", tone: "danger" },
  ],
};

export const HUMIDITY_SCALE: Scale = {
  min: 0,
  max: 100,
  unit: "%",
  segments: [
    { to: 30, label: "Kering", tone: "warn" },
    { to: 60, label: "Ideal", tone: "good" },
    { to: 75, label: "Lembap", tone: "warn" },
    { to: 100, label: "Sangat Lembap", tone: "danger" },
  ],
};

export function classify(value: number, scale: Scale): ScaleSegment {
  for (const segment of scale.segments) {
    if (value < segment.to) return segment;
  }
  return scale.segments[scale.segments.length - 1];
}

/** Posisi (0..1) nilai pada skala, dibatasi agar penanda tidak keluar dari bar. */
export function scalePosition(value: number, scale: Scale): number {
  const ratio = (value - scale.min) / (scale.max - scale.min);
  return Math.min(1, Math.max(0, ratio));
}
