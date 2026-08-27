import Link from "next/link";

import {
  AdminEmptyState,
  AdminMetric,
  AdminPageHeader,
  AdminPanel,
  AdminProgress,
  AdminStatusPill,
} from "@/components/admin/AdminUi";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";
import { getAdminControlTowerData } from "@/modules/admin/core/getAdminControlTowerData";
import { getAdminWorkflowHealth } from "@/modules/admin/core/getAdminWorkflowHealth";

export default async function AdminDashboard() {
  await requirePlatformAdmin();

  const [core, workflows] = await Promise.all([
    getAdminControlTowerData(),
    getAdminWorkflowHealth(30),
  ]);

  const workflowAttention =
    workflows.returns.review +
    workflows.carbon.attention +
    workflows.commercial.unpricedCompletedJobs +
    workflows.billing.failedInvoices +
    workflows.billing.pastDueOrganisations;

  const setupAttention = workflows.organisations
    .filter((row) => row.status === "ACTIVE" && !row.isSuspended && !row.setup.ready)
    .sort((a, b) => a.setup.readyCount - b.setup.readyCount)
    .slice(0, 6);

  return (
    <div className="space-y-7">
      <AdminPageHeader
        eyebrow="Waste X Platform"
        title="Platform Control Tower"
        description="One platform view across customer access, Jobs and Loads, Digital Waste Tracking, Quarterly Returns, Transport Emissions, Commercial & Invoicing, Waste X subscription billing, support and system health. Customer operations remain inside each customer workspace."
        actions={
          <>
            <Link href="/admin/workflows" className="rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-bold text-white transition hover:border-red-500 hover:text-red-400">Workflow Health</Link>
            <Link href="/admin/organisations" className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-red-700">Organisations</Link>
          </>
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <AdminMetric label="Active organisations" value={workflows.activeOrganisations} helper={`${core.organisations.pending} pending approval · ${core.organisations.total} total`} danger={core.organisations.pending > 0} />
        <AdminMetric label="Completed Loads" value={workflows.operations.completedLoads} helper={`${workflows.operations.tonnes.toFixed(3)} t in the last ${workflows.days} days`} />
        <AdminMetric label="Workflow attention" value={workflowAttention} helper="Returns + carbon + commercial + billing signals" danger={workflowAttention > 0} />
        <AdminMetric label="Support" value={core.support.open} helper={`${core.support.urgent} urgent · ${core.support.unassigned} unassigned`} danger={core.support.urgent > 0 || core.support.unassigned > 0} />
        <AdminMetric label="System" value={core.system.unresolvedErrors} helper={`${core.system.criticalErrors} critical unresolved errors`} danger={core.system.unresolvedErrors > 0} />
      </section>

      {core.organisations.pending > 0 ? (
        <section className="rounded-[1.8rem] border border-red-700/40 bg-red-950/30 p-6 text-white">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div><p className="text-[10px] font-black uppercase tracking-[0.24em] text-red-500">Action required</p><h2 className="mt-2 text-xl font-black">{core.organisations.pending} organisation{core.organisations.pending === 1 ? "" : "s"} awaiting approval</h2><p className="mt-2 text-sm text-white/50">Approve the customer account first, then monitor capability-specific workspace readiness separately.</p></div>
            <Link href="/admin/organisations" className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-red-700">Review approvals →</Link>
          </div>
        </section>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-2 2xl:grid-cols-4">
        <AdminPanel eyebrow="Quarterly Returns" title={workflows.quarter.label} description="Current-quarter return preparation health." action={<Link href="/admin/quarterly-returns" className="text-xs font-black text-red-600">Open →</Link>}>
          <div className="space-y-3"><Row label="Candidate Loads" value={workflows.returns.candidates} /><Row label="Ready" value={workflows.returns.ready} /><Row label="Needs review" value={workflows.returns.review} danger={workflows.returns.review > 0} /></div>
        </AdminPanel>

        <AdminPanel eyebrow="Transport Emissions" title="Automatic postcode routing" description="Completed Loads eligible for road-route tonne-km CO₂e." action={<Link href="/admin/transport-emissions" className="text-xs font-black text-red-600">Open →</Link>}>
          <AdminProgress value={workflows.carbon.calculated} total={workflows.carbon.eligible} label="Coverage" />
          <div className="mt-4 space-y-3"><Row label="Calculated" value={workflows.carbon.calculated} /><Row label="Pending" value={workflows.carbon.pending} /><Row label="Needs attention" value={workflows.carbon.attention} danger={workflows.carbon.attention > 0} /></div>
        </AdminPanel>

        <AdminPanel eyebrow="Commercial" title="Job pricing & customer invoices" description="Adoption of Job-specific pricing and operational invoicing." action={<Link href="/admin/commercial" className="text-xs font-black text-red-600">Open →</Link>}>
          <div className="space-y-3"><Row label="Invoice-ready Jobs" value={workflows.commercial.invoiceReadyJobs} /><Row label="Unpriced completed Jobs" value={workflows.commercial.unpricedCompletedJobs} danger={workflows.commercial.unpricedCompletedJobs > 0} /><Row label="Issued customer invoices" value={workflows.commercial.issuedInvoices} /><Row label="Paid customer invoices" value={workflows.commercial.paidInvoices} /></div>
        </AdminPanel>

        <AdminPanel eyebrow="Platform Billing" title="Waste X subscriptions" description="Waste X's own billing, separate from customer operational invoices." action={<Link href="/admin/billing" className="text-xs font-black text-red-600">Open →</Link>}>
          <div className="space-y-3"><Row label="Active subscriptions" value={workflows.billing.activeSubscriptions} /><Row label="Past due organisations" value={workflows.billing.pastDueOrganisations} danger={workflows.billing.pastDueOrganisations > 0} /><Row label="Failed platform invoices" value={workflows.billing.failedInvoices} danger={workflows.billing.failedInvoices > 0} /></div>
        </AdminPanel>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <AdminPanel eyebrow="Customer Readiness" title="Capability-aware workspace setup" description="Manager requirements are checked only for manager-capable organisations; fleet requirements are checked only for carrier-capable organisations." action={<Link href="/admin/organisations" className="text-xs font-black text-red-600">All organisations →</Link>}>
          {setupAttention.length === 0 ? <AdminEmptyState>All active organisations pass their current capability-specific setup checks.</AdminEmptyState> : <div className="space-y-3">{setupAttention.map((item) => <Link key={item.id} href={`/admin/organisations/${item.id}`} className="block rounded-2xl border border-black/10 p-4 transition hover:border-red-300 hover:bg-red-50/40"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="font-black text-black">{item.teamName}</p><p className="mt-1 text-xs text-black/40">{item.capabilities.length ? item.capabilities.join(" + ") : "No capabilities"} · {item.setup.readyCount}/{item.setup.requiredCount} checks passed</p></div><AdminStatusPill label="Setup attention" tone="danger" /></div><div className="mt-3 flex flex-wrap gap-2">{item.setup.checks.filter((check) => !check.ok).slice(0, 4).map((check) => <span key={check.key} className="rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-red-700">{check.label}</span>)}</div></Link>)}</div>}
        </AdminPanel>

        <AdminPanel eyebrow="Digital Waste Tracking" title="DWT platform health" description="Submission and PAT investigation stays in the specialist DWT surface." action={<Link href="/admin/digital-waste-tracking" className="text-xs font-black text-red-600">DWT Control →</Link>}>
          <div className="grid gap-3 sm:grid-cols-2"><Small label="Enabled orgs" value={core.dwt.enabledOrganisations} /><Small label="Attempts 24h" value={core.dwt.attempts24} /><Small label="Accepted 24h" value={core.dwt.accepted24} /><Small label="Needs attention" value={core.dwt.needsAttention24} danger={core.dwt.needsAttention24 > 0} /></div>
        </AdminPanel>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <AdminPanel eyebrow="Support" title="Customer support queue" action={<Link href="/admin/support" className="text-xs font-black text-red-600">Open support →</Link>}>
          {core.support.recent.length === 0 ? <AdminEmptyState>No support tickets recorded.</AdminEmptyState> : <div className="space-y-3">{core.support.recent.map((ticket) => <Link key={ticket.id} href={`/admin/support/${ticket.id}`} className="flex items-center justify-between gap-4 rounded-2xl border border-black/10 p-4 transition hover:border-red-300"><div><p className="text-sm font-black text-black">{formatLabel(ticket.category)}</p><p className="mt-1 text-xs text-black/40">{ticket.organisation?.teamName ?? "Unknown organisation"} · {formatLabel(ticket.status)}</p></div><AdminStatusPill label={ticket.priority} tone={ticket.priority === "urgent" || ticket.priority === "high" ? "danger" : "neutral"} /></Link>)}</div>}
        </AdminPanel>

        <AdminPanel eyebrow="System Health" title="Unresolved platform errors" action={<Link href="/admin/errors" className="text-xs font-black text-red-600">Investigate →</Link>}>
          {core.system.recentErrors.length === 0 ? <AdminEmptyState>No unresolved errors in the latest system view.</AdminEmptyState> : <div className="space-y-3">{core.system.recentErrors.map((error) => <div key={error.id} className="rounded-2xl border border-red-100 bg-red-50/50 p-4"><div className="flex items-center justify-between gap-3"><p className="text-sm font-black text-black">{error.code}</p><AdminStatusPill label={error.severity} tone={error.severity === "critical" || error.severity === "high" ? "danger" : "neutral"} /></div><p className="mt-2 line-clamp-2 text-xs leading-5 text-black/45">{error.message}</p></div>)}</div>}
        </AdminPanel>
      </section>
    </div>
  );
}

function Row({ label, value, danger = false }: { label: string; value: string | number; danger?: boolean }) { return <div className="flex items-center justify-between rounded-2xl border border-black/10 px-4 py-3"><span className="text-sm font-semibold text-black/50">{label}</span><span className={`text-sm font-black ${danger ? "text-red-600" : "text-black"}`}>{value}</span></div>; }
function Small({ label, value, danger = false }: { label: string; value: string | number; danger?: boolean }) { return <div className={`rounded-2xl border p-4 ${danger ? "border-red-200 bg-red-50" : "border-black/10 bg-[#f7f7f7]"}`}><p className="text-[9px] font-black uppercase tracking-[0.16em] text-black/35">{label}</p><p className={`mt-2 text-2xl font-black ${danger ? "text-red-600" : "text-black"}`}>{value}</p></div>; }
function formatLabel(value: string | null | undefined) { if (!value) return "Unknown"; return value.replaceAll("_", " ").replaceAll("-", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()); }
