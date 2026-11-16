// Tipe bersama antara API (server) dan dashboard (client). Jangan impor Prisma di file ini.

export const RANGE_SECONDS = {
  "1h": 60 * 60,
  "6h": 6 * 60 * 60,
  "24h": 24 * 60 * 60,
  "7d": 7 * 24 * 60 * 60,
  "30d": 30 * 24 * 60 * 60,
} as const;

export type RangeKey = keyof typeof RANGE_SECONDS;

export const RANGE_LABELS: Record<RangeKey, string> = {
  "1h": "1 Jam",
  "6h": "6 Jam",
  "24h": "24 Jam",
  "7d": "7 Hari",
  "30d": "30 Hari",
};

export const RANGE_KEYS = Object.keys(RANGE_SECONDS) as RangeKey[];

export function isRangeKey(value: unknown): value is RangeKey {
  return typeof value === "string" && value in RANGE_SECONDS;
}

export type Reading = {
  id: number;
  deviceId: string;
  temperature: number;
  humidity: number;
  latitude: number | null;
  longitude: number | null;
  /** ISO 8601 – waktu pengukuran */
  measuredAt: string;
  /** ISO 8601 – waktu diterima backend */
  receivedAt: string;
};

export type DeviceSummary = {
  deviceId: string;
  totalReadings: number;
  /** ISO 8601 – waktu data terakhir diterima backend */
  lastSeenAt: string;
};

export type MinAvgMax = { min: number; avg: number; max: number };

export type Stats = {
  count: number;
  temperature: MinAvgMax | null;
  humidity: MinAvgMax | null;
  firstAt: string | null;
  lastAt: string | null;
};

export type ChartPoint = {
  /** ISO 8601 */
  t: string;
  temperature: number;
  humidity: number;
};

export type DeviceLocation = {
  latitude: number;
  longitude: number;
  /** ISO 8601 – kapan koordinat ini diukur/dikirim */
  recordedAt: string;
  /** true jika koordinat berasal dari data paling baru perangkat */
  fromLatestReading: boolean;
};

export type DashboardResponse = {
  serverTime: string;
  offlineThresholdSeconds: number;
  /** Total seluruh baris data di database (semua perangkat) */
  totalReadings: number;
  devices: DeviceSummary[];
  selectedDeviceId: string | null;
  latest: Reading | null;
  /** Umur data terakhir yang diterima (detik) pada saat respons dibuat */
  ageSeconds: number | null;
  isOnline: boolean;
  location: DeviceLocation | null;
  range: RangeKey;
  stats: Stats;
  chart: {
    /** 0 = data mentah; >0 = rata-rata per bucket (detik) agar grafik tetap ringan */
    bucketSeconds: number;
    points: ChartPoint[];
  };
};

export type HistoryResponse = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: Reading[];
};

export type LatestResponse = {
  serverTime: string;
  offlineThresholdSeconds: number;
  deviceId: string | null;
  latest: Reading | null;
  ageSeconds: number | null;
  isOnline: boolean;
};
