import { Prisma, type SensorReading } from "@prisma/client";
import { prisma } from "./prisma";
import { MAX_CHART_POINTS, OFFLINE_THRESHOLD_SECONDS } from "./config";
import {
  RANGE_SECONDS,
  type ChartPoint,
  type DashboardResponse,
  type DeviceLocation,
  type DeviceSummary,
  type HistoryResponse,
  type LatestResponse,
  type RangeKey,
  type Reading,
  type Stats,
} from "./types";

const NEWEST_FIRST: Prisma.SensorReadingOrderByWithRelationInput[] = [{ measuredAt: "desc" }, { id: "desc" }];

const round = (n: number, digits = 2) => Number(n.toFixed(digits));

function toReading(r: SensorReading): Reading {
  return {
    id: r.id,
    deviceId: r.deviceId,
    temperature: r.temperature,
    humidity: r.humidity,
    latitude: r.latitude,
    longitude: r.longitude,
    measuredAt: r.measuredAt.toISOString(),
    receivedAt: r.receivedAt.toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* Perangkat                                                           */
/* ------------------------------------------------------------------ */

/** Daftar perangkat yang pernah mengirim data, yang paling baru aktif di urutan pertama. */
export async function getDevices(): Promise<DeviceSummary[]> {
  const rows = await prisma.sensorReading.groupBy({
    by: ["deviceId"],
    _count: { _all: true },
    _max: { receivedAt: true },
  });

  return rows
    .map((r) => ({
      deviceId: r.deviceId,
      totalReadings: r._count._all,
      lastSeenAt: (r._max.receivedAt ?? new Date(0)).toISOString(),
    }))
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
}

function pickDevice(devices: DeviceSummary[], requested: string | null): string | null {
  if (requested && devices.some((d) => d.deviceId === requested)) return requested;
  return devices[0]?.deviceId ?? null;
}

function connectionInfo(devices: DeviceSummary[], deviceId: string | null) {
  const device = deviceId ? devices.find((d) => d.deviceId === deviceId) : undefined;
  if (!device) return { ageSeconds: null, isOnline: false };

  const ageSeconds = Math.max(0, (Date.now() - new Date(device.lastSeenAt).getTime()) / 1000);
  return { ageSeconds: round(ageSeconds, 1), isOnline: ageSeconds <= OFFLINE_THRESHOLD_SECONDS };
}

/* ------------------------------------------------------------------ */
/* Data terbaru                                                        */
/* ------------------------------------------------------------------ */

export async function getLatestReading(deviceId: string | null): Promise<Reading | null> {
  const row = await prisma.sensorReading.findFirst({
    where: deviceId ? { deviceId } : undefined,
    orderBy: NEWEST_FIRST,
  });
  return row ? toReading(row) : null;
}

/** Data terbaru + status Online/Offline berdasarkan waktu terakhir backend menerima data. */
export async function getLatestStatus(requestedDeviceId: string | null): Promise<LatestResponse> {
  const devices = await getDevices();
  const deviceId = pickDevice(devices, requestedDeviceId);
  const latest = deviceId ? await getLatestReading(deviceId) : null;

  return {
    serverTime: new Date().toISOString(),
    offlineThresholdSeconds: OFFLINE_THRESHOLD_SECONDS,
    deviceId,
    latest,
    ...connectionInfo(devices, deviceId),
  };
}

/** Koordinat aktual terakhir yang pernah dikirim perangkat (tidak pernah dikarang). */
export async function getLastKnownLocation(deviceId: string): Promise<DeviceLocation | null> {
  const row = await prisma.sensorReading.findFirst({
    where: { deviceId, latitude: { not: null }, longitude: { not: null } },
    orderBy: NEWEST_FIRST,
  });
  if (!row || row.latitude == null || row.longitude == null) return null;

  const newest = await prisma.sensorReading.findFirst({
    where: { deviceId },
    orderBy: NEWEST_FIRST,
    select: { id: true },
  });

  return {
    latitude: row.latitude,
    longitude: row.longitude,
    recordedAt: row.measuredAt.toISOString(),
    fromLatestReading: newest?.id === row.id,
  };
}

/* ------------------------------------------------------------------ */
/* Riwayat                                                             */
/* ------------------------------------------------------------------ */

export async function getHistory(opts: {
  deviceId: string | null;
  page: number;
  pageSize: number;
}): Promise<HistoryResponse> {
  const where: Prisma.SensorReadingWhereInput = opts.deviceId ? { deviceId: opts.deviceId } : {};

  const [total, rows] = await prisma.$transaction([
    prisma.sensorReading.count({ where }),
    prisma.sensorReading.findMany({
      where,
      orderBy: NEWEST_FIRST,
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
    }),
  ]);

  return {
    page: opts.page,
    pageSize: opts.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / opts.pageSize)),
    items: rows.map(toReading),
  };
}

/* ------------------------------------------------------------------ */
/* Statistik                                                           */
/* ------------------------------------------------------------------ */

export async function getStats(deviceId: string, range: RangeKey): Promise<Stats> {
  const since = new Date(Date.now() - RANGE_SECONDS[range] * 1000);

  const agg = await prisma.sensorReading.aggregate({
    where: { deviceId, measuredAt: { gte: since } },
    _count: { _all: true },
    _avg: { temperature: true, humidity: true },
    _min: { temperature: true, humidity: true, measuredAt: true },
    _max: { temperature: true, humidity: true, measuredAt: true },
  });

  const count = agg._count._all;
  if (count === 0) {
    return { count: 0, temperature: null, humidity: null, firstAt: null, lastAt: null };
  }

  return {
    count,
    temperature: {
      min: agg._min.temperature ?? 0,
      avg: agg._avg.temperature ?? 0,
      max: agg._max.temperature ?? 0,
    },
    humidity: {
      min: agg._min.humidity ?? 0,
      avg: agg._avg.humidity ?? 0,
      max: agg._max.humidity ?? 0,
    },
    firstAt: agg._min.measuredAt?.toISOString() ?? null,
    lastAt: agg._max.measuredAt?.toISOString() ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Deret waktu untuk grafik                                            */
/* ------------------------------------------------------------------ */

/**
 * Mengambil data grafik dari database.
 * Jika jumlah data pada rentang waktu melebihi MAX_CHART_POINTS, data dirata-ratakan per bucket
 * waktu (agregasi SQL atas data nyata) agar respons tetap ringan.
 */
export async function getChartSeries(
  deviceId: string,
  range: RangeKey,
): Promise<{ bucketSeconds: number; points: ChartPoint[] }> {
  const rangeSeconds = RANGE_SECONDS[range];
  const since = new Date(Date.now() - rangeSeconds * 1000);
  const where = { deviceId, measuredAt: { gte: since } };

  const count = await prisma.sensorReading.count({ where });
  if (count === 0) return { bucketSeconds: 0, points: [] };

  if (count <= MAX_CHART_POINTS) {
    const rows = await prisma.sensorReading.findMany({
      where,
      orderBy: [{ measuredAt: "asc" }, { id: "asc" }],
      select: { measuredAt: true, temperature: true, humidity: true },
    });
    return {
      bucketSeconds: 0,
      points: rows.map((r) => ({
        t: r.measuredAt.toISOString(),
        temperature: r.temperature,
        humidity: r.humidity,
      })),
    };
  }

  // bucket dihitung di server (bilangan bulat), bukan dari input pengguna → aman dipakai sebagai literal.
  const bucket = Math.max(1, Math.ceil(rangeSeconds / MAX_CHART_POINTS));
  const bucketSql = Prisma.raw(String(bucket));

  const rows = await prisma.$queryRaw<{ bucket: Date; temperature: number; humidity: number }[]>(Prisma.sql`
    SELECT
      to_timestamp(floor(extract(epoch FROM "measuredAt") / ${bucketSql}) * ${bucketSql}) AS bucket,
      avg("temperature")::float8 AS temperature,
      avg("humidity")::float8 AS humidity
    FROM "sensor_readings"
    WHERE "deviceId" = ${deviceId} AND "measuredAt" >= ${since}
    GROUP BY 1
    ORDER BY 1
  `);

  return {
    bucketSeconds: bucket,
    points: rows.map((r) => ({
      t: new Date(r.bucket).toISOString(),
      temperature: round(Number(r.temperature)),
      humidity: round(Number(r.humidity)),
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Ringkasan dashboard (satu panggilan, satu snapshot konsisten)       */
/* ------------------------------------------------------------------ */

export async function getDashboard(opts: {
  deviceId: string | null;
  range: RangeKey;
}): Promise<DashboardResponse> {
  const devices = await getDevices();
  const totalReadings = devices.reduce((sum, d) => sum + d.totalReadings, 0);
  const selectedDeviceId = pickDevice(devices, opts.deviceId);

  const base = {
    serverTime: new Date().toISOString(),
    offlineThresholdSeconds: OFFLINE_THRESHOLD_SECONDS,
    totalReadings,
    devices,
    selectedDeviceId,
    range: opts.range,
  };

  if (!selectedDeviceId) {
    return {
      ...base,
      latest: null,
      ageSeconds: null,
      isOnline: false,
      location: null,
      stats: { count: 0, temperature: null, humidity: null, firstAt: null, lastAt: null },
      chart: { bucketSeconds: 0, points: [] },
    };
  }

  const [latest, location, stats, chart] = await Promise.all([
    getLatestReading(selectedDeviceId),
    getLastKnownLocation(selectedDeviceId),
    getStats(selectedDeviceId, opts.range),
    getChartSeries(selectedDeviceId, opts.range),
  ]);

  return {
    ...base,
    latest,
    location,
    stats,
    chart,
    ...connectionInfo(devices, selectedDeviceId),
  };
}
