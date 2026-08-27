import Link from "next/link";

import { AdminMetric, AdminPageHeader, AdminPanel } from "@/components/admin/AdminUi";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";
import { getAdminControlTowerData } from "@/modules/admin/core/getAdminControlTowerData";
import { getAdminWorkflowHealth } from "@/modules/admin/core/getAdminWorkflowHealth";

export default async function AdminAlertsPage() {
  await requirePlatformAdmin();
  const [core, workflows] = await Promise.all([getAdminControlTowerData(), getAdminWorkflowHealth(30)]);

  const supportAlerts = core.support.urgent + core.support.unassigned;
  const workflowAlerts = workflows.returns.review + workflows.carbon.attention + workflows.commercial.unpricedCompletedJobs + workflows.billing.failedInvoices + workflows.billing.pastDueOrganisations;
  const total = core.organisations.pending + supportAlerts + core.system.unresolvedErrors + core.dwt.needsAttention24 + workflowAlerts;

  return (
    <div className="space-y-7">
      <AdminPageHeader eyebrow="Platform Operations" title="Alerts" description="Current platform signals across onboarding, DWT, Quarterly Returns, Transport Emissions, Commercials, subscription billing, support and system health. Legacy marketplace/listing alerts are not the primary Waste X operating model." actions={<Link href="/admin" className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700">Control Tower</Link>} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <AdminMetric label="Alerts" value={total} helper="Current platform attention signals" danger={total > 0} />
        <AdminMetric label="Onboarding" value={core.organisations.pending} helper="Pending organisation approvals" danger={core.organisations.pending > 0} />
        <AdminMetric label="Product workflows" value={workflowAlerts} helper="Returns + carbon + commercial + billing" danger={workflowAlerts > 0} />
        <AdminMetric label="Support" value={supportAlerts} helper="Urgent + unassigned active tickets" danger={supportAlerts > 0} />
        <AdminMetric label="System" value={core.system.unresolvedErrors} helper="Unresolved system errors" danger={core.system.unresolvedErrors > 0} />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <AdminPanel eyebrow="Compliance & Sustainability" title="Workflow attention"><div className="space-y-3"><AlertRow label="DWT rejected / failed · 24h" value={core.dwt.needsAttention24} href="/admin/digital-waste-tracking" /><AlertRow label={`Quarterly Return review · ${workflows.quarter.label}`} value={workflows.returns.review} href="/admin/quarterly-returns" /><AlertRow label="Transport-emissions route issues" value={workflows.carbon.attention} href="/admin/transport-emissions" /><AlertRow label="Missing transport postcodes" value={workflows.carbon.missingPostcode} href="/admin/transport-emissions" /></div></AdminPanel>
        <AdminPanel eyebrow="Commercial & Billing" title="Business workflow attention"><div className="space-y-3"><AlertRow label="Unpriced completed Jobs" value={workflows.commercial.unpricedCompletedJobs} href="/admin/commercial" /><AlertRow label="Past-due organisations" value={workflows.billing.pastDueOrganisations} href="/admin/billing" /><AlertRow label="Failed Waste X invoices" value={workflows.billing.failedInvoices} href="/admin/billing" /></div></AdminPanel>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <AdminPanel eyebrow="Customer Support" title="Support attention" action={<Link href="/admin/support" className="text-xs font-black text-red-600">Support →</Link>}><div className="grid gap-3 md:grid-cols-3"><AlertBox label="Active tickets" value={core.support.open} /><AlertBox label="Urgent" value={core.support.urgent} danger /><AlertBox label="Unassigned" value={core.support.unassigned} danger /></div></AdminPanel>
        <AdminPanel eyebrow="System Health" title="Technical attention" action={<Link href="/admin/errors" className="text-xs font-black text-red-600">System Health →</Link>}><div className="space-y-3"><AlertRow label="Unresolved platform errors" value={core.system.unresolvedErrors} href="/admin/errors" /><AlertRow label="Critical errors" value={core.system.criticalErrors} href="/admin/errors?severity=critical" /><AlertRow label="External-service errors" value={core.system.externalErrors} href="/admin/errors" /></div></AdminPanel>
      </section>
    </div>
  );
}

function AlertRow({ label, value, href }: { label: string; value: number; href: string }) { return <Link href={href} className="flex items-center justify-between rounded-2xl border border-black/10 px-4 py-3 hover:border-red-300"><span className="text-sm font-bold text-black">{label}</span><span className={value > 0 ? "text-sm font-black text-red-600" : "text-sm font-black text-black"}>{value}</span></Link>; }
function AlertBox({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) { return <div className={`rounded-2xl border p-4 ${danger && value > 0 ? "border-red-200 bg-red-50" : "border-black/10"}`}><p className="text-[9px] font-black uppercase tracking-[0.16em] text-black/35">{label}</p><p className={`mt-2 text-2xl font-black ${danger && value > 0 ? "text-red-600" : "text-black"}`}>{value}</p></div>; }
