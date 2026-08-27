import Link from "next/link";

import { AdminMetric, AdminPageHeader, AdminPanel, AdminStatusPill, TableCell, TableHead } from "@/components/admin/AdminUi";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";
import { getAdminControlTowerData } from "@/modules/admin/core/getAdminControlTowerData";
import { getAdminWorkflowHealth } from "@/modules/admin/core/getAdminWorkflowHealth";

export default async function AdminWorkflowHealthPage() {
  await requirePlatformAdmin();
  const [core, data] = await Promise.all([getAdminControlTowerData(), getAdminWorkflowHealth(30)]);
  const rows = data.organisations
    .filter((row) => row.status === "ACTIVE" && !row.isSuspended)
    .sort((a, b) => b.attentionSignals - a.attentionSignals);

  return (
    <div className="space-y-7">
      <AdminPageHeader eyebrow="Control" title="Workflow Health" description="Cross-organisation health for the workflows that now make up Waste X: Jobs & Loads, DWT, Quarterly Returns, postcode-based Transport Emissions, Job-specific Commercials and customer invoicing. This surface identifies support signals without becoming a customer Job editor." actions={<Link href="/admin" className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700">Control Tower</Link>} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <AdminMetric label="Jobs" value={data.operations.jobs} helper={`Created in ${data.days} days`} />
        <AdminMetric label="Completed Loads" value={data.operations.completedLoads} helper={`${data.operations.tonnes.toFixed(3)} tonnes`} />
        <AdminMetric label="DWT attention" value={core.dwt.needsAttention24} helper="Rejected / failed in 24h" danger={core.dwt.needsAttention24 > 0} />
        <AdminMetric label="Return review" value={data.returns.review} helper={`${data.quarter.label} Loads`} danger={data.returns.review > 0} />
        <AdminMetric label="Carbon attention" value={data.carbon.attention} helper={`${data.carbon.coverage}% calculated coverage`} danger={data.carbon.attention > 0} />
      </section>

      <AdminPanel eyebrow="Customer Workspaces" title="Current workflow register" description="One row per active organisation. Red values are support signals, not permission for platform admins to alter customer operational data.">
        <div className="overflow-hidden rounded-2xl border border-black/10"><div className="overflow-x-auto"><table className="w-full min-w-[1550px] divide-y divide-black/10 text-sm"><thead><tr><TableHead>Organisation</TableHead><TableHead>Capabilities</TableHead><TableHead>Setup</TableHead><TableHead>Jobs</TableHead><TableHead>Completed Loads</TableHead><TableHead>Returns</TableHead><TableHead>Transport CO₂e</TableHead><TableHead>Commercial</TableHead><TableHead>Customer invoices</TableHead><TableHead>Attention</TableHead></tr></thead><tbody className="divide-y divide-black/10 bg-white">{rows.map((row) => <tr key={row.id} className="hover:bg-red-50/30"><TableCell><Link href={`/admin/organisations/${row.id}`} className="font-black text-black hover:text-red-600">{row.teamName}</Link></TableCell><TableCell>{row.capabilities.length ? row.capabilities.join(" + ") : "—"}</TableCell><TableCell><AdminStatusPill label={`${row.setup.readyCount}/${row.setup.requiredCount}`} tone={row.setup.ready ? "success" : "danger"} /></TableCell><TableCell>{row.operations.jobs}</TableCell><TableCell>{row.operations.completedLoads}</TableCell><TableCell><span className={row.returns.review > 0 ? "font-black text-red-600" : "font-black text-black"}>{row.returns.ready} ready · {row.returns.review} review</span></TableCell><TableCell><span className={row.carbon.attention > 0 ? "font-black text-red-600" : "font-black text-black"}>{row.carbon.coverage}% · {row.carbon.attention} issue</span></TableCell><TableCell><span className={row.commercial.unpricedCompletedJobs > 0 ? "font-black text-red-600" : "font-black text-black"}>{row.commercial.invoiceReadyJobs} invoice-ready · {row.commercial.unpricedCompletedJobs} unpriced</span></TableCell><TableCell>{row.customerInvoices.draft} draft · {row.customerInvoices.issued} issued · {row.customerInvoices.paid} paid</TableCell><TableCell><AdminStatusPill label={String(row.attentionSignals)} tone={row.attentionSignals > 0 ? "danger" : "success"} /></TableCell></tr>)}</tbody></table></div></div>
      </AdminPanel>
    </div>
  );
}
