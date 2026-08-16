import Link from "next/link";

import {
  AdminMetric,
  AdminPageHeader,
  AdminPanel,
  AdminStatusPill,
} from "@/components/admin/AdminUi";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";
import { getAdminControlTowerData } from "@/modules/admin/core/getAdminControlTowerData";

export default async function AdminDashboard() {
  await requirePlatformAdmin();
  const data = await getAdminControlTowerData();

  return (
    <div className="space-y-7">
      <AdminPageHeader
        eyebrow="Waste X Platform"
        title="Platform Control Tower"
        description="Run Waste X as a platform: customer readiness, user access, Digital Waste Tracking health, support, system risk and cross-platform activity. Customer jobs remain inside each organisation workspace."
        actions={
          <>
            <Link href="/admin/organisations" className="rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-bold text-white transition hover:border-red-500 hover:text-red-400">
              Organisations
            </Link>
            <Link href="/admin/digital-waste-tracking" className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-red-700">
              DWT Control
            </Link>
          </>
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminMetric
          label="Organisations"
          value={data.organisations.active}
          helper={`${data.organisations.pending} pending · ${data.organisations.total} total`}
          danger={data.organisations.pending > 0}
        />
        <AdminMetric
          label="Users"
          value={data.users.active}
          helper={`${data.users.invited} invited · ${data.users.suspended} suspended`}
          danger={data.users.suspended > 0}
        />
        <AdminMetric
          label="Support"
          value={data.support.open}
          helper={`${data.support.urgent} urgent · ${data.support.unassigned} unassigned`}
          danger={data.support.urgent > 0 || data.support.unassigned > 0}
        />
        <AdminMetric
          label="System"
          value={data.system.unresolvedErrors}
          helper={`${data.system.criticalErrors} critical unresolved errors`}
          danger={data.system.unresolvedErrors > 0}
        />
      </section>

      {data.organisations.pending > 0 ? (
        <section className="rounded-[1.8rem] border border-red-700/40 bg-red-950/30 p-6 text-white">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-red-500">Action Required</p>
              <h2 className="mt-2 text-xl font-black">{data.organisations.pending} organisation{data.organisations.pending === 1 ? "" : "s"} awaiting approval</h2>
              <p className="mt-2 text-sm text-white/50">Review customer onboarding before they enter the active Solo Waste Manager workspace.</p>
            </div>
            <Link href="/admin/organisations" className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-red-700">
              Review approvals →
            </Link>
          </div>
        </section>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <AdminPanel
          eyebrow="Digital Waste Tracking"
          title="DWT platform health"
          description="Oversight only. The approved DWT Control and PAT systems remain the source of truth and are not modified by this admin rebuild."
          action={
            <Link href="/admin/digital-waste-tracking" className="rounded-full bg-black px-4 py-2 text-xs font-black text-white transition hover:bg-red-600">
              Open DWT Control
            </Link>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <SmallMetric label="Enabled orgs" value={data.dwt.enabledOrganisations} />
            <SmallMetric label="Attempts 24h" value={data.dwt.attempts24} />
            <SmallMetric label="Accepted 24h" value={data.dwt.accepted24} />
            <SmallMetric label="Warnings 24h" value={data.dwt.warnings24} />
            <SmallMetric label="Needs attention" value={data.dwt.needsAttention24} danger={data.dwt.needsAttention24 > 0} />
          </div>

          <div className="mt-5 rounded-2xl border border-black/10 bg-black p-5 text-white">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-500">Latest API attempt</p>
                {data.dwt.latest ? (
                  <>
                    <p className="mt-2 text-sm font-bold">{formatLabel(data.dwt.latest.status)}</p>
                    <p className="mt-1 text-xs text-white/45">
                      {data.dwt.latest.method ?? "Method not recorded"} · {data.dwt.latest.endpoint ?? "Endpoint not recorded"}
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-white/50">No DWT attempt recorded in the last 24 hours.</p>
                )}
              </div>
              <Link href="/admin/digital-waste-tracking/pat" className="rounded-full border border-red-800 bg-red-950/30 px-4 py-2 text-xs font-black text-red-300 transition hover:bg-red-600 hover:text-white">
                PAT Tracker
              </Link>
            </div>
          </div>
        </AdminPanel>

        <AdminPanel
          eyebrow="Operations"
          title="Platform usage · 7 days"
          description="Customer-side operational usage without giving platform admins control of customer jobs."
        >
          <div className="space-y-3">
            <MetricRow label="Jobs booked" value={data.operations.jobs7} />
            <MetricRow label="Completed loads" value={data.operations.completedLoads7} />
            <MetricRow label="Recorded tonnes" value={data.operations.tonnes7.toFixed(3)} />
            <MetricRow label="Organisations booking" value={data.operations.organisationsBookingJobs7} />
          </div>
          <Link href="/admin/reports" className="mt-5 inline-flex text-sm font-black text-red-600 hover:text-red-700">
            Open platform reports →
          </Link>
        </AdminPanel>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <AdminPanel
          eyebrow="Customer Health"
          title="Workspace readiness"
          description="Active organisations missing one or more core Solo Waste Manager setup areas."
          action={<Link href="/admin/organisations" className="text-xs font-black text-red-600">All organisations →</Link>}
        >
          {data.organisations.needsSetup.length === 0 ? (
            <EmptyState text="All active organisations pass the core readiness checks." />
          ) : (
            <div className="space-y-3">
              {data.organisations.needsSetup.map((item) => (
                <Link
                  key={item.organisation.id}
                  href={`/admin/organisations/${item.organisation.id}`}
                  className="block rounded-2xl border border-black/10 p-4 transition hover:border-red-300 hover:bg-red-50/40"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-black text-black">{item.organisation.teamName}</p>
                      <p className="mt-1 text-xs text-black/40">{item.readyCount}/{item.totalChecks} readiness checks passed</p>
                    </div>
                    <AdminStatusPill label={item.readyCount === item.totalChecks ? "Ready" : "Setup needed"} tone={item.readyCount === item.totalChecks ? "dark" : "danger"} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.12em]">
                    <Check label="Site" ok={item.hasReceivingSite} />
                    <Check label="Permit" ok={item.hasPermit} />
                    <Check label="Materials" ok={item.hasMaterials} />
                    <Check label="DWT" ok={item.dwtReady} />
                    <Check label="User" ok={item.hasActiveUser} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </AdminPanel>

        <AdminPanel
          eyebrow="Support"
          title="Customer support queue"
          description="Urgent, unassigned and recently updated support tickets."
          action={<Link href="/admin/support" className="text-xs font-black text-red-600">Open support →</Link>}
        >
          {data.support.recent.length === 0 ? (
            <EmptyState text="No support tickets recorded." />
          ) : (
            <div className="space-y-3">
              {data.support.recent.map((ticket) => (
                <Link key={ticket.id} href={`/admin/support/${ticket.id}`} className="flex items-center justify-between gap-4 rounded-2xl border border-black/10 p-4 transition hover:border-red-300">
                  <div>
                    <p className="text-sm font-black text-black">{formatLabel(ticket.category)}</p>
                    <p className="mt-1 text-xs text-black/40">{ticket.organisation?.teamName ?? "Unknown organisation"} · {formatLabel(ticket.status)}</p>
                  </div>
                  <AdminStatusPill
                    label={ticket.priority}
                    tone={ticket.priority === "urgent" || ticket.priority === "high" ? "danger" : "neutral"}
                  />
                </Link>
              ))}
            </div>
          )}
        </AdminPanel>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <AdminPanel
          eyebrow="System Health"
          title="Unresolved platform errors"
          description="Application, database, authentication, validation and external-service errors."
          action={<Link href="/admin/errors" className="text-xs font-black text-red-600">Investigate →</Link>}
        >
          {data.system.recentErrors.length === 0 ? (
            <EmptyState text="No unresolved errors in the latest system view." />
          ) : (
            <div className="space-y-3">
              {data.system.recentErrors.map((error) => (
                <div key={error.id} className="rounded-2xl border border-red-100 bg-red-50/50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-black text-black">{error.code}</p>
                    <AdminStatusPill label={error.severity} tone={error.severity === "critical" || error.severity === "high" ? "danger" : "neutral"} />
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-black/45">{error.message}</p>
                </div>
              ))}
            </div>
          )}
        </AdminPanel>

        <AdminPanel
          eyebrow="Platform Activity"
          title="Recent audit events"
          description="Cross-organisation platform activity from the audit event stream."
          action={<Link href="/admin/audit" className="text-xs font-black text-red-600">Full audit →</Link>}
        >
          {data.activity.length === 0 ? (
            <EmptyState text="No audit events recorded yet." />
          ) : (
            <div className="divide-y divide-black/10">
              {data.activity.slice(0, 8).map((event) => (
                <div key={event.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-black text-black">{formatLabel(event.action)}</p>
                    <p className="mt-1 text-xs text-black/40">
                      {event.organisation?.teamName ?? "Platform"} · {formatLabel(event.entityType)} · {event.user?.name ?? "System"}
                    </p>
                  </div>
                  <p className="text-xs font-semibold text-black/35">{formatDateTime(event.createdAt)}</p>
                </div>
              ))}
            </div>
          )}
        </AdminPanel>
      </section>
    </div>
  );
}

function SmallMetric({ label, value, danger = false }: { label: string; value: string | number; danger?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${danger ? "border-red-200 bg-red-50" : "border-black/10 bg-[#f7f7f7]"}`}>
      <p className="text-[9px] font-black uppercase tracking-[0.16em] text-black/35">{label}</p>
      <p className={`mt-2 text-2xl font-black ${danger ? "text-red-600" : "text-black"}`}>{value}</p>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-black/10 px-4 py-3">
      <span className="text-sm font-semibold text-black/50">{label}</span>
      <span className="text-sm font-black text-black">{value}</span>
    </div>
  );
}

function Check({ label, ok }: { label: string; ok: boolean }) {
  return <span className={ok ? "rounded-full bg-black px-2.5 py-1 text-white" : "rounded-full bg-red-100 px-2.5 py-1 text-red-700"}>{ok ? "✓" : "×"} {label}</span>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-black/15 bg-black/[0.02] p-6 text-sm font-semibold text-black/40">{text}</div>;
}

function formatLabel(value: string | null | undefined) {
  if (!value) return "Unknown";
  return value.replaceAll("_", " ").replaceAll("-", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
