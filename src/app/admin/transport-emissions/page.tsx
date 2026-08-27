import Link from "next/link";

import { AdminEmptyState, AdminMetric, AdminPageHeader, AdminPanel, AdminProgress, AdminStatusPill, TableCell, TableHead } from "@/components/admin/AdminUi";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";
import { getAdminWorkflowHealth } from "@/modules/admin/core/getAdminWorkflowHealth";

export default async function AdminTransportEmissionsPage() {
  await requirePlatformAdmin();
  const data = await getAdminWorkflowHealth(30);
  const orgRows = data.organisations.filter((row) => row.carbon.eligible > 0).sort((a, b) => b.carbon.attention - a.carbon.attention || a.carbon.coverage - b.carbon.coverage);

  return (
    <div className="space-y-7">
      <AdminPageHeader eyebrow="Product Operations" title="Transport Emissions" description="Platform health for the automatic postcode → road distance → actual tonnes → tonne-km CO₂e workflow. Platform admins diagnose coverage and routing problems; customers correct Site/route data in their workspace." actions={<Link href="/admin/workflows" className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700">Workflow Health</Link>} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <AdminMetric label="Eligible Loads" value={data.carbon.eligible} helper={`Completed positive-weight Loads · ${data.days} days`} />
        <AdminMetric label="Calculated" value={data.carbon.calculated} helper={`${data.carbon.coverage}% automatic coverage`} tone="success" />
        <AdminMetric label="Pending" value={data.carbon.pending} helper="Ready for automatic calculation" tone={data.carbon.pending > 0 ? "warning" : "default"} />
        <AdminMetric label="Needs attention" value={data.carbon.attention} helper="Postcode / geocode / route failures" danger={data.carbon.attention > 0} />
        <AdminMetric label="Missing postcode" value={data.carbon.missingPostcode} helper="Customer route review can resolve these" danger={data.carbon.missingPostcode > 0} />
      </section>

      <AdminPanel eyebrow="Coverage" title="Automatic calculation coverage"><AdminProgress value={data.carbon.calculated} total={data.carbon.eligible} label="Platform coverage" /></AdminPanel>

      <AdminPanel eyebrow="Organisation Health" title="Transport-emissions adoption">
        <div className="overflow-hidden rounded-2xl border border-black/10"><div className="overflow-x-auto"><table className="w-full min-w-[1050px] divide-y divide-black/10 text-sm"><thead><tr><TableHead>Organisation</TableHead><TableHead>Eligible</TableHead><TableHead>Calculated</TableHead><TableHead>Pending</TableHead><TableHead>Attention</TableHead><TableHead>Coverage</TableHead></tr></thead><tbody className="divide-y divide-black/10">{orgRows.map((row) => <tr key={row.id} className="hover:bg-red-50/30"><TableCell><Link href={`/admin/organisations/${row.id}`} className="font-black text-black hover:text-red-600">{row.teamName}</Link></TableCell><TableCell>{row.carbon.eligible}</TableCell><TableCell>{row.carbon.calculated}</TableCell><TableCell>{row.carbon.pending}</TableCell><TableCell><span className={row.carbon.attention > 0 ? "font-black text-red-600" : "font-black text-black"}>{row.carbon.attention}</span></TableCell><TableCell><AdminStatusPill label={`${row.carbon.coverage}%`} tone={row.carbon.attention > 0 ? "warning" : "success"} /></TableCell></tr>)}</tbody></table></div></div>
      </AdminPanel>

      <AdminPanel eyebrow="Routing Attention" title="Loads needing route review" description="This explains what customer support should investigate. It deliberately does not expose a platform-admin route editor.">
        {data.carbonIssues.length === 0 ? <AdminEmptyState>No postcode/geocoding/routing failures were detected in the current window.</AdminEmptyState> : <div className="overflow-hidden rounded-2xl border border-black/10"><div className="overflow-x-auto"><table className="w-full min-w-[1200px] divide-y divide-black/10 text-sm"><thead><tr><TableHead>Organisation</TableHead><TableHead>Job / Load</TableHead><TableHead>Direction</TableHead><TableHead>Origin</TableHead><TableHead>Destination</TableHead><TableHead>Status</TableHead><TableHead>Error</TableHead></tr></thead><tbody className="divide-y divide-black/10">{data.carbonIssues.slice(0, 50).map((row) => <tr key={row.jobLoadId} className="hover:bg-red-50/30"><TableCell><Link href={`/admin/organisations/${row.organisationId}`} className="font-black text-black hover:text-red-600">{row.organisationName}</Link></TableCell><TableCell><span className="font-black text-black">{row.jobNumber}</span> · Load {row.loadNumber}</TableCell><TableCell>{row.direction}</TableCell><TableCell>{row.originPostcode || "Missing"}</TableCell><TableCell>{row.destinationPostcode || "Missing"}</TableCell><TableCell><AdminStatusPill label={formatLabel(row.status)} tone="danger" /></TableCell><TableCell className="whitespace-normal"><p className="max-w-md text-xs leading-5 text-black/50">{row.error}</p></TableCell></tr>)}</tbody></table></div></div>}
      </AdminPanel>
    </div>
  );
}

function formatLabel(value: string) { return value.replaceAll("_", " ").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
