import type { ReactNode } from "react";
import type { Tone } from "@/lib/status";

export function Card({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-sm font-semibold text-slate-900">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

const badgeTone: Record<Tone, string> = {
  info: "bg-sky-50 text-sky-700 ring-sky-200",
  good: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warn: "bg-amber-50 text-amber-800 ring-amber-200",
  danger: "bg-rose-50 text-rose-700 ring-rose-200",
  muted: "bg-slate-100 text-slate-600 ring-slate-200",
};

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${badgeTone[tone]}`}>
      {children}
    </span>
  );
}

export type ConnectionState = "loading" | "waiting" | "online" | "offline";

const pillStyle: Record<ConnectionState, { box: string; dot: string; label: string }> = {
  loading: { box: "bg-slate-100 text-slate-600 ring-slate-200", dot: "bg-slate-400", label: "Memuat…" },
  waiting: { box: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-500", label: "Menunggu Data ESP32" },
  online: { box: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500", label: "ESP32 Online" },
  offline: { box: "bg-rose-50 text-rose-700 ring-rose-200", dot: "bg-rose-500", label: "ESP32 Offline" },
};

export function StatusPill({ state }: { state: ConnectionState }) {
  const s = pillStyle[state];
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset ${s.box}`}>
      <span className="relative flex h-2.5 w-2.5">
        {state === "online" && (
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${s.dot}`} />
        )}
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${s.dot}`} />
      </span>
      {s.label}
    </span>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-[10rem] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-8 text-center">
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {children && <p className="mt-1 max-w-md text-xs text-slate-500">{children}</p>}
    </div>
  );
}
