import type { ReactNode } from "react";

export type AdminTone = "neutral" | "danger" | "dark" | "success" | "warning";

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-black text-white shadow-2xl shadow-black/20">
      <div className="absolute -right-24 -top-24 size-72 rounded-full bg-red-600/15 blur-3xl" />
      <div className="h-1 bg-red-600" />
      <div className="relative flex flex-col gap-6 p-7 lg:flex-row lg:items-end lg:justify-between lg:p-8">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.32em] text-red-500">{eyebrow}</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-white/55">{description}</p>
        </div>
        {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
      </div>
    </section>
  );
}

export function AdminMetric({
  label,
  value,
  helper,
  danger = false,
  tone,
}: {
  label: string;
  value: string | number;
  helper: string;
  danger?: boolean;
  tone?: "default" | "danger" | "warning" | "success";
}) {
  const resolvedTone = danger ? "danger" : tone ?? "default";
  const valueClass = {
    default: "text-black",
    danger: "text-red-600",
    warning: "text-amber-700",
    success: "text-emerald-700",
  }[resolvedTone];
  const dotClass = {
    default: "bg-black",
    danger: "bg-red-600",
    warning: "bg-amber-500",
    success: "bg-emerald-600",
  }[resolvedTone];

  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white p-5 text-black shadow-xl shadow-black/10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-black/35">{label}</p>
          <p className={`mt-3 text-3xl font-black tracking-tight ${valueClass}`}>{value}</p>
        </div>
        <span className={`mt-1 size-3 rounded-full ${dotClass}`} />
      </div>
      <p className="mt-3 text-xs font-medium leading-5 text-black/45">{helper}</p>
    </div>
  );
}

export function AdminPanel({
  eyebrow,
  title,
  description,
  children,
  action,
  className = "",
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-[1.8rem] border border-white/10 bg-white text-black shadow-xl shadow-black/10 ${className}`}>
      <div className="flex flex-col gap-4 border-b border-black/10 p-6 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-red-600">{eyebrow}</p>
          <h2 className="mt-2 text-xl font-black tracking-tight">{title}</h2>
          {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-black/50">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="p-6">{children}</div>
    </section>
  );
}

export function AdminStatusPill({ label, tone = "neutral" }: { label: string; tone?: AdminTone }) {
  const classes = {
    neutral: "border-black/10 bg-black/5 text-black/55",
    danger: "border-red-200 bg-red-50 text-red-700",
    dark: "border-black bg-black text-white",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
  }[tone];

  return <span className={`inline-flex whitespace-nowrap rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.15em] ${classes}`}>{label}</span>;
}

export function AdminProgress({ value, total, label }: { value: number; total: number; label?: string }) {
  const pct = total > 0 ? Math.max(0, Math.min(100, (value / total) * 100)) : 0;
  return (
    <div>
      {label ? <div className="mb-2 flex items-center justify-between text-[10px] font-black uppercase tracking-[0.12em] text-black/35"><span>{label}</span><span>{value}/{total}</span></div> : null}
      <div className="h-2 overflow-hidden rounded-full bg-black/10"><div className="h-full rounded-full bg-black transition-all" style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

export function AdminEmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-black/15 bg-black/[0.02] p-6 text-sm font-semibold leading-6 text-black/40">{children}</div>;
}

export function AdminLinkButton({ href, children, secondary = false }: { href: string; children: ReactNode; secondary?: boolean }) {
  return <a href={href} className={secondary ? "inline-flex rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-bold text-white transition hover:border-red-500 hover:text-red-400" : "inline-flex rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-red-700"}>{children}</a>;
}

export function TableHead({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <th className={`whitespace-nowrap bg-black px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.18em] text-white/55 ${className}`}>{children}</th>;
}

export function TableCell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`whitespace-nowrap px-4 py-4 align-middle text-sm text-black/60 ${className}`}>{children}</td>;
}
