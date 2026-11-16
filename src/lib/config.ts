// Konfigurasi sisi server (dibaca dari environment).

const parsed = Number(process.env.OFFLINE_THRESHOLD_SECONDS);

/** Batas waktu (detik) tanpa data baru sebelum perangkat dianggap OFFLINE. */
export const OFFLINE_THRESHOLD_SECONDS =
  Number.isFinite(parsed) && parsed >= 5 ? Math.floor(parsed) : 60;

/** Jumlah titik maksimum pada grafik. Di atas ini data dirata-ratakan per bucket waktu. */
export const MAX_CHART_POINTS = 600;
