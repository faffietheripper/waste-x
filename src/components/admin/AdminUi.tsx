import type { ReactNode } from "react";

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
    <section className="overflow-hidden rounded-[1.8rem] border border-white/10 bg-black text-white shadow-2xl shadow-black/20">
      <div className="h-1 bg-red-600" />
      <div className="flex flex-col gap-6 p-7 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.32em] text-red-500">
            {eyebrow}
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
            {description}
          </p>
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
}: {
  label: string;
  value: string | number;
  helper: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white p-5 text-black shadow-xl shadow-black/10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-black/35">
            {label}
          </p>
          <p className={`mt-3 text-3xl font-black tracking-tight ${danger ? "text-red-600" : "text-black"}`}>
            {value}
          </p>
        </div>
        <span className={`mt-1 size-3 rounded-full ${danger ? "bg-red-600" : "bg-black"}`} />
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
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-red-600">
            {eyebrow}
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight">{title}</h2>
          {description ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-black/50">{description}</p>
          ) : null}
        </div>
        {action ? <div>{action}</div> : null}
      </div>
      <div className="p-6">{children}</div>
    </section>
  );
}

export function AdminStatusPill({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "danger" | "dark" | "success";
}) {
  const classes = {
    neutral: "border-black/10 bg-black/5 text-black/55",
    danger: "border-red-200 bg-red-50 text-red-700",
    dark: "border-black bg-black text-white",
    success: "border-black bg-white text-black",
  }[tone];

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.15em] ${classes}`}>
      {label}
    </span>
  );
}

export function AdminLinkButton({
  href,
  children,
  secondary = false,
}: {
  href: string;
  children: ReactNode;
  secondary?: boolean;
}) {
  return (
    <a
      href={href}
      className={secondary
        ? "inline-flex rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-bold text-white transition hover:border-red-500 hover:text-red-400"
        : "inline-flex rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-red-700"}
    >
      {children}
    </a>
  );
}

export function TableHead({ children }: { children: ReactNode }) {
  return (
    <th className="whitespace-nowrap bg-black px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.18em] text-white/55">
      {children}
    </th>
  );
}

export function TableCell({ children }: { children: ReactNode }) {
  return <td className="whitespace-nowrap px-4 py-4 align-middle text-sm text-black/60">{children}</td>;
}
