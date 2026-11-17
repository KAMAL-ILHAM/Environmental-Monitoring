"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConditionScale } from "./ConditionScale";
import { HistoryTable } from "./HistoryTable";
import { SensorChart } from "./SensorChart";
import { Badge, Card, EmptyState, StatusPill, type ConnectionState } from "./ui";
import { fmt, formatAge, formatDateTime } from "@/lib/format";
import { HUMIDITY_SCALE, TEMPERATURE_SCALE, classify } from "@/lib/status";
import {
  RANGE_KEYS,
  RANGE_LABELS,
  type DashboardResponse,
  type HistoryResponse,
  type RangeKey,
} from "@/lib/types";

// Leaflet butuh `window`, jadi hanya dimuat di browser.
const DeviceMap = dynamic(() => import("./DeviceMap"), {
  ssr: false,
  loading: () => <div className="h-72 animate-pulse rounded-xl bg-slate-100" />,
});

/** Interval pembaruan otomatis (ms). Tidak ada reload halaman. */
const POLL_INTERVAL_MS = 1500;
const HISTORY_PAGE_SIZE = 15;

export function Dashboard() {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [range, setRange] = useState<RangeKey>("24h");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<DashboardResponse | null>(null);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);

  // Waktu klien saat `data` diterima; dipakai agar umur data terus bertambah tanpa menunggu polling berikutnya.
  const [dataReceivedAt, setDataReceivedAt] = useState<number>(() => Date.now());
  const [now, setNow] = useState<number>(() => Date.now());

  // Pilihan terbaru dibaca lewat ref agar loop polling tidak perlu dibuat ulang.
  const selection = useRef({ deviceId, range, page });
  selection.current = { deviceId, range, page };
  const refreshRef = useRef<() => Promise<void>>(async () => {});

  const refresh = useCallback(async () => {
    const sel = selection.current;
    const dashParams = new URLSearchParams({ range: sel.range });
    if (sel.deviceId) dashParams.set("deviceId", sel.deviceId);

    try {
      const dashRes = await fetch(`/api/dashboard?${dashParams}`, { cache: "no-store" });
      if (!dashRes.ok) throw new Error(`dashboard ${dashRes.status}`);
      const dash: DashboardResponse = await dashRes.json();

      const histParams = new URLSearchParams({ page: String(sel.page), pageSize: String(HISTORY_PAGE_SIZE) });
      if (dash.selectedDeviceId) histParams.set("deviceId", dash.selectedDeviceId);
      const histRes = await fetch(`/api/sensor?${histParams}`, { cache: "no-store" });
      if (!histRes.ok) throw new Error(`history ${histRes.status}`);
      const hist: HistoryResponse = await histRes.json();

      // Abaikan hasil usang jika pengguna sudah mengganti pilihan saat request berjalan.
      const cur = selection.current;
      if (cur.range !== sel.range || cur.page !== sel.page || cur.deviceId !== sel.deviceId) return;

      setData(dash);
      setHistory(hist);
      setDataReceivedAt(Date.now());
      setLastSyncAt(Date.now());
      setFetchError(false);
    } catch {
      setFetchError(true);
    }
  }, []);
  refreshRef.current = refresh;

  // Loop polling otomatis.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      await refreshRef.current();
      if (!cancelled) timer = setTimeout(tick, POLL_INTERVAL_MS);
    };
    tick();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  // Segera muat ulang saat perangkat / rentang / halaman riwayat diganti.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    refreshRef.current();
  }, [deviceId, range, page]);

  // Detak 1 detik untuk memperbarui "x detik lalu" dan status Online/Offline.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const latest = data?.latest ?? null;
  const hasData = !!latest;

  const liveAgeSeconds = data?.ageSeconds != null ? data.ageSeconds + (now - dataReceivedAt) / 1000 : null;
  const isOnline = liveAgeSeconds != null && data != null && liveAgeSeconds <= data.offlineThresholdSeconds;

  const connection: ConnectionState = !data ? "loading" : !hasData ? "waiting" : isOnline ? "online" : "offline";

  const temperatureData = useMemo(
    () => (data?.chart.points ?? []).map((p) => ({ ts: new Date(p.t).getTime(), value: p.temperature })),
    [data],
  );
  const humidityData = useMemo(
    () => (data?.chart.points ?? []).map((p) => ({ ts: new Date(p.t).getTime(), value: p.humidity })),
    [data],
  );

  const tempCondition = latest ? classify(latest.temperature, TEMPERATURE_SCALE) : null;
  const humCondition = latest ? classify(latest.humidity, HUMIDITY_SCALE) : null;

  const selectedId = data?.selectedDeviceId ?? null;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-600 text-white shadow-sm">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M14 14.76V4a2 2 0 1 0-4 0v10.76a4 4 0 1 0 4 0Z" />
              <path d="M12 9v6" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight text-slate-900">Environmental Monitoring</h1>
            <p className="text-xs text-slate-500">ESP32 + DHT22 · data langsung dari database</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {data && data.devices.length > 1 && (
            <select
              value={selectedId ?? ""}
              onChange={(e) => {
                setDeviceId(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm"
              aria-label="Pilih perangkat"
            >
              {data.devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.deviceId}
                </option>
              ))}
            </select>
          )}
          <StatusPill state={connection} />
        </div>
      </header>

      {fetchError && (
        <div role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Tidak dapat mengambil data dari server/database. Mencoba lagi otomatis…
          {lastSyncAt && <span className="text-rose-500"> Sinkron terakhir: {formatDateTime(new Date(lastSyncAt).toISOString())}.</span>}
        </div>
      )}

      {/* Banner kondisi awal: belum ada data sama sekali */}
      {data && !hasData && (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          <p className="text-sm font-semibold text-amber-900">Menunggu Data ESP32</p>
          <p className="mt-1 text-sm text-amber-800">
            Belum ada data sensor yang diterima backend. Nyalakan ESP32, pastikan terhubung ke Wi-Fi, dan arahkan
            ke endpoint <code className="rounded bg-amber-100 px-1 py-0.5 text-xs">POST /api/sensor</code>. Dashboard
            ini akan terisi otomatis begitu data pertama masuk — tidak ada data contoh yang ditampilkan.
          </p>
        </div>
      )}

      {/* Kartu utama */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Suhu</p>
          <p className="mt-2 flex items-baseline gap-1">
            <span className="text-4xl font-semibold tabular-nums text-slate-900">{fmt(latest?.temperature, 1)}</span>
            <span className="text-lg text-slate-500">°C</span>
          </p>
          <div className="mt-3 h-6">
            {tempCondition ? <Badge tone={tempCondition.tone}>{tempCondition.label}</Badge> : <Badge tone="muted">Menunggu data</Badge>}
          </div>
        </Card>

        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Kelembapan</p>
          <p className="mt-2 flex items-baseline gap-1">
            <span className="text-4xl font-semibold tabular-nums text-slate-900">{fmt(latest?.humidity, 1)}</span>
            <span className="text-lg text-slate-500">%</span>
          </p>
          <div className="mt-3 h-6">
            {humCondition ? <Badge tone={humCondition.tone}>{humCondition.label}</Badge> : <Badge tone="muted">Menunggu data</Badge>}
          </div>
        </Card>

        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Status Perangkat</p>
          <p className="mt-2 text-xl font-semibold text-slate-900">
            {connection === "online" && "Online"}
            {connection === "offline" && "Offline"}
            {connection === "waiting" && "Menunggu Data ESP32"}
            {connection === "loading" && "Memuat…"}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {liveAgeSeconds != null && hasData
              ? `Data terakhir ${formatAge(liveAgeSeconds)}`
              : "Belum ada data diterima"}
          </p>
          {latest && <p className="mt-0.5 truncate text-xs text-slate-400">{latest.deviceId}</p>}
        </Card>

        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total Data Tersimpan</p>
          <p className="mt-2 text-4xl font-semibold tabular-nums text-slate-900">
            {data ? data.totalReadings.toLocaleString("id-ID") : "—"}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {latest ? `Terakhir: ${formatDateTime(latest.measuredAt)}` : "baris di database"}
          </p>
        </Card>
      </div>

      {/* Indikator kondisi + peta */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card title="Indikator Kondisi" subtitle="Posisi nilai terkini pada skala acuan" className="lg:col-span-2">
          <div className="space-y-6">
            <ConditionScale title="Suhu" scale={TEMPERATURE_SCALE} value={latest?.temperature ?? null} />
            <ConditionScale title="Kelembapan" scale={HUMIDITY_SCALE} value={latest?.humidity ?? null} />
          </div>
        </Card>

        <Card
          title="Lokasi Perangkat"
          subtitle="Berdasarkan lokasi perangkat saat ini"
          className="lg:col-span-3"
        >
          <div className="h-72 overflow-hidden rounded-xl border border-slate-200">
            <DeviceMap
              latitude={data?.location?.latitude}
              longitude={data?.location?.longitude}
              label={selectedId ?? "Lokasi Perangkat"}
            />
          </div>
        </Card>
      </div>

      {/* Grafik */}
      <Card
        className="mt-4"
        title="Grafik Suhu & Kelembapan"
        subtitle={
          data && data.chart.bucketSeconds > 0
            ? `Rata-rata per ${Math.round(data.chart.bucketSeconds / 60) || 1} menit dari data nyata di database`
            : "Setiap titik adalah satu data aktual dari database"
        }
        action={
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5" role="group" aria-label="Rentang waktu">
            {RANGE_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setRange(key);
                }}
                className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                  range === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {RANGE_LABELS[key]}
              </button>
            ))}
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <SensorChart
            title="Suhu"
            unit="°C"
            color="#e11d48"
            gradientId="gradTemp"
            data={temperatureData}
            range={range}
            yDomain={[(min) => Math.floor(min - 1), (max) => Math.ceil(max + 1)]}
          />
          <SensorChart
            title="Kelembapan"
            unit="%"
            color="#0891b2"
            gradientId="gradHum"
            data={humidityData}
            range={range}
            yDomain={[(min) => Math.max(0, Math.floor(min - 2)), (max) => Math.min(100, Math.ceil(max + 2))]}
          />
        </div>
      </Card>

      {/* Statistik */}
      <Card className="mt-4" title={`Statistik ${RANGE_LABELS[range]} Terakhir`} subtitle="Dihitung langsung dari database">
        {data && data.stats.count > 0 && data.stats.temperature && data.stats.humidity ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatBlock label="Suhu" unit="°C" values={data.stats.temperature} count={data.stats.count} />
            <StatBlock label="Kelembapan" unit="%" values={data.stats.humidity} count={data.stats.count} />
          </div>
        ) : (
          <EmptyState title="Belum ada statistik">
            {hasData
              ? "Tidak ada data pada rentang waktu ini. Coba pilih rentang yang lebih panjang."
              : "Statistik muncul setelah ESP32 mengirim data."}
          </EmptyState>
        )}
      </Card>

      {/* Riwayat */}
      <Card
        className="mt-4"
        title="Riwayat Data Sensor"
        subtitle="Seluruh data yang pernah diterima, terbaru di atas"
      >
        <HistoryTable history={history} onPageChange={setPage} />
      </Card>

      <footer className="mt-6 pb-4 text-center text-xs text-slate-400">
        Pembaruan otomatis tiap {POLL_INTERVAL_MS / 1000} detik
        {lastSyncAt ? ` · sinkron ${formatDateTime(new Date(lastSyncAt).toISOString())}` : ""} · Peta © OpenStreetMap
      </footer>
    </div>
  );
}

function StatBlock({
  label,
  unit,
  values,
  count,
}: {
  label: string;
  unit: string;
  values: { min: number; avg: number; max: number };
  count: number;
}) {
  const cell = (name: string, value: number) => (
    <div className="rounded-xl bg-slate-50 px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{name}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
        {fmt(value, 1)} <span className="text-sm font-normal text-slate-500">{unit}</span>
      </p>
    </div>
  );

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-700">{label}</h3>
        <span className="text-xs text-slate-400">{count.toLocaleString("id-ID")} data</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {cell("Min", values.min)}
        {cell("Rata-rata", values.avg)}
        {cell("Maks", values.max)}
      </div>
    </div>
  );
}
