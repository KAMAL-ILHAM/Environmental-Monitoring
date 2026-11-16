import { fmt, fmtCoord, formatDateTime } from "@/lib/format";
import type { HistoryResponse } from "@/lib/types";
import { EmptyState } from "./ui";

type Props = {
  history: HistoryResponse | null;
  onPageChange: (page: number) => void;
};

export function HistoryTable({ history, onPageChange }: Props) {
  if (!history) {
    return <div className="h-40 animate-pulse rounded-xl bg-slate-100" />;
  }

  if (history.total === 0) {
    return (
      <EmptyState title="Belum ada riwayat data">
        Riwayat akan terisi otomatis setelah ESP32 mengirim data pertamanya ke backend.
      </EmptyState>
    );
  }

  const from = (history.page - 1) * history.pageSize + 1;
  const to = Math.min(history.total, from + history.items.length - 1);

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5">ID</th>
              <th className="px-4 py-2.5">Waktu Data</th>
              <th className="px-4 py-2.5">Perangkat</th>
              <th className="px-4 py-2.5 text-right">Suhu</th>
              <th className="px-4 py-2.5 text-right">Kelembapan</th>
              <th className="px-4 py-2.5">Koordinat</th>
              <th className="px-4 py-2.5">Diterima Server</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {history.items.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50/70">
                <td className="whitespace-nowrap px-4 py-2 text-slate-400">#{r.id}</td>
                <td className="whitespace-nowrap px-4 py-2 text-slate-700">{formatDateTime(r.measuredAt)}</td>
                <td className="whitespace-nowrap px-4 py-2 text-slate-600">{r.deviceId}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right font-medium text-slate-900">
                  {fmt(r.temperature, 1)} °C
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right font-medium text-slate-900">
                  {fmt(r.humidity, 1)} %
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-slate-500">
                  {r.latitude != null && r.longitude != null
                    ? `${fmtCoord(r.latitude)}, ${fmtCoord(r.longitude)}`
                    : "—"}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-slate-400">{formatDateTime(r.receivedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
        <span>
          Menampilkan {from.toLocaleString("id-ID")}–{to.toLocaleString("id-ID")} dari{" "}
          {history.total.toLocaleString("id-ID")} data
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPageChange(history.page - 1)}
            disabled={history.page <= 1}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Sebelumnya
          </button>
          <span className="tabular-nums">
            {history.page} / {history.totalPages}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(history.page + 1)}
            disabled={history.page >= history.totalPages}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Berikutnya
          </button>
        </div>
      </div>
    </div>
  );
}
