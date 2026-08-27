import Link from "next/link";

import { AdminMetric, AdminPageHeader, AdminPanel, AdminStatusPill, TableCell, TableHead } from "@/components/admin/AdminUi";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";
import { getAdminPlatformReportData } from "@/modules/admin/core/getAdminControlTowerData";
import { getAdminWorkflowHealth } from "@/modules/admin/core/getAdminWorkflowHealth";

type PageProps = { searchParams?: { days?: string } };

export default async function AdminReportsPage({ searchParams }: PageProps) {
  await requirePlatformAdmin();
  const requestedDays = Number(searchParams?.days ?? 30);
  const [report, workflows] = await Promise.all([
    getAdminPlatformReportData(requestedDays),
    getAdminWorkflowHealth(requestedDays),
  ]);

  return (
    <div className="space-y-7">
      <AdminPageHeader eyebrow="Platform Business" title="Platform Reports" description="Waste X adoption and product health across Jobs & Loads, DWT, Quarterly Returns, automatic Transport Emissions, Commercial & Invoicing and platform subscription billing. Customer operational reports remain inside each organisation workspace." actions={<Link href="/admin/audit" className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700">Activity & Audit</Link>} />

      <div className="flex flex-wrap gap-2">{[7, 30, 90].map((days) => <Link key={days} href={`/admin/reports?days=${days}`} className={`rounded-full px-4 py-2 text-xs font-black transition ${report.days === days ? "bg-red-600 text-white" : "border border-white/15 bg-white/5 text-white/60 hover:text-white"}`}>{days} days</Link>)}</div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <AdminMetric label="Organisations booking" value={report.organisationsBooking} helper={`Customer organisations creating Jobs in ${report.days} days`} />
        <AdminMetric label="Jobs" value={report.jobs} helper={`Jobs created in ${report.days} days`} />
        <AdminMetric label="Completed Loads" value={report.completedLoads} helper={`${report.tonnes.toFixed(3)} tonnes`} />
        <AdminMetric label="DWT acceptance" value={`${report.dwtAcceptanceRate}%`} helper={`${report.dwtAccepted}/${report.dwtAttempts} accepted`} danger={report.dwtAttempts > 0 && report.dwtAcceptanceRate < 95} />
        <AdminMetric label="Carbon coverage" value={`${workflows.carbon.coverage}%`} helper={`${workflows.carbon.calculated}/${workflows.carbon.eligible} eligible Loads`} danger={workflows.carbon.attention > 0} />
      </section>

      <section className="grid gap-6 xl:grid-cols-2 2xl:grid-cols-4">
        <AdminPanel eyebrow="Quarterly Returns" title={workflows.quarter.label}><div className="space-y-3"><Row label="Candidate Loads" value={workflows.returns.candidates} /><Row label="Ready" value={workflows.returns.ready} /><Row label="Review" value={workflows.returns.review} danger={workflows.returns.review > 0} /></div></AdminPanel>
        <AdminPanel eyebrow="Transport Emissions" title="Automatic calculation"><div className="space-y-3"><Row label="Eligible" value={workflows.carbon.eligible} /><Row label="Calculated" value={workflows.carbon.calculated} /><Row label="Pending" value={workflows.carbon.pending} /><Row label="Attention" value={workflows.carbon.attention} danger={workflows.carbon.attention > 0} /></div></AdminPanel>
        <AdminPanel eyebrow="Commercial" title="Customer workflow"><div className="space-y-3"><Row label="Invoice-ready Jobs" value={workflows.commercial.invoiceReadyJobs} /><Row label="Unpriced completed" value={workflows.commercial.unpricedCompletedJobs} danger={workflows.commercial.unpricedCompletedJobs > 0} /><Row label="Issued invoices" value={workflows.commercial.issuedInvoices} /><Row label="Paid invoice value" value={money(workflows.commercial.paidValue)} /></div></AdminPanel>
        <AdminPanel eyebrow="Platform Billing" title="Waste X revenue ops"><div className="space-y-3"><Row label="Active subscriptions" value={workflows.billing.activeSubscriptions} /><Row label="Past due" value={workflows.billing.pastDueOrganisations} danger={workflows.billing.pastDueOrganisations > 0} /><Row label="Failed invoices" value={workflows.billing.failedInvoices} danger={workflows.billing.failedInvoices > 0} /><Row label="Paid value" value={money(workflows.billing.paidValue)} /></div></AdminPanel>
      </section>

      <AdminPanel eyebrow="Export Audit" title="Recent generated reports" description="Existing report-export audit history is retained for governance.">
        {report.exports.length === 0 ? <div className="rounded-2xl border border-dashed border-black/15 p-6 text-sm font-semibold text-black/40">No report exports recorded.</div> : <div className="overflow-hidden rounded-2xl border border-black/10"><div className="overflow-x-auto"><table className="w-full min-w-[1050px] divide-y divide-black/10 text-sm"><thead><tr><TableHead>Report</TableHead><TableHead>Organisation</TableHead><TableHead>Requested by</TableHead><TableHead>Type</TableHead><TableHead>Format</TableHead><TableHead>Status</TableHead><TableHead>Rows</TableHead><TableHead>Created</TableHead></tr></thead><tbody className="divide-y divide-black/10">{report.exports.map((item) => <tr key={item.id} className="hover:bg-red-50/30"><TableCell><span className="font-black text-black">{item.title}</span></TableCell><TableCell>{item.organisation?.teamName ?? "Unknown"}</TableCell><TableCell>{item.requestedBy?.name ?? item.requestedBy?.email ?? "Unknown"}</TableCell><TableCell>{formatLabel(item.reportType)}</TableCell><TableCell>{item.format.toUpperCase()}</TableCell><TableCell><AdminStatusPill label={formatLabel(item.status)} tone={item.status === "failed" ? "danger" : item.status === "completed" ? "success" : "neutral"} /></TableCell><TableCell>{item.rowCount ?? 0}</TableCell><TableCell>{formatDate(item.createdAt)}</TableCell></tr>)}</tbody></table></div></div>}
      </AdminPanel>
    </div>
  );
}

function Row({ label, value, danger = false }: { label: string; value: string | number; danger?: boolean }) { return <div className="flex items-center justify-between rounded-2xl border border-black/10 px-4 py-3"><span className="text-sm font-semibold text-black/50">{label}</span><span className={`text-sm font-black ${danger ? "text-red-600" : "text-black"}`}>{value}</span></div>; }
function formatLabel(value: string) { return value.replaceAll("_", " ").replaceAll("-", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function formatDate(value: Date | string | null | undefined) { if (!value) return "—"; return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function money(value: number) { return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value); }
