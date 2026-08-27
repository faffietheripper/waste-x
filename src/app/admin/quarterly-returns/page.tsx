import Link from "next/link";

import { AdminEmptyState, AdminMetric, AdminPageHeader, AdminPanel, AdminStatusPill, TableCell, TableHead } from "@/components/admin/AdminUi";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";
import { getAdminWorkflowHealth } from "@/modules/admin/core/getAdminWorkflowHealth";

export default async function AdminQuarterlyReturnsPage() {
  await requirePlatformAdmin();
  const data = await getAdminWorkflowHealth(90);
  const orgRows = data.organisations
    .filter((row) => row.returns.candidates > 0 || row.capabilities.includes("manager"))
    .sort((a, b) => b.returns.review - a.returns.review || b.returns.candidates - a.returns.candidates);

  return (
    <div className="space-y-7">
      <AdminPageHeader eyebrow="Compliance" title="Quarterly Returns" description={`Platform oversight for ${data.quarter.label}. Waste X checks preparation health and exceptions here; customers still own their regulator submission from the workspace.`} actions={<><Link href="/admin/workflows" className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-bold text-white hover:border-red-500">Workflow Health</Link><Link href="/admin/digital-waste-tracking" className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700">DWT Control</Link></>} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminMetric label="Candidate Loads" value={data.returns.candidates} helper={`Incoming + outgoing · ${data.quarter.label}`} />
        <AdminMetric label="Ready" value={data.returns.ready} helper="Prepared rows with no current factual issue" tone="success" />
        <AdminMetric label="Needs review" value={data.returns.review} helper={`${data.returns.organisationsWithReview} organisations affected`} danger={data.returns.review > 0} />
        <AdminMetric label="Explicit settings" value={data.returns.configuredOrganisations} helper="Organisations with a return-settings record" />
      </section>

      <AdminPanel eyebrow="Organisation Health" title="Current-quarter return readiness" description="Common defaults are not treated as exceptions. This view focuses on factual issues such as EWC, weight, D/R, permit and Origin/Destination geography.">
        <div className="overflow-hidden rounded-2xl border border-black/10"><div className="overflow-x-auto"><table className="w-full min-w-[1000px] divide-y divide-black/10 text-sm"><thead><tr><TableHead>Organisation</TableHead><TableHead>Capabilities</TableHead><TableHead>Candidate Loads</TableHead><TableHead>Ready</TableHead><TableHead>Review</TableHead><TableHead>Status</TableHead></tr></thead><tbody className="divide-y divide-black/10">{orgRows.map((row) => <tr key={row.id} className="hover:bg-red-50/30"><TableCell><Link href={`/admin/organisations/${row.id}`} className="font-black text-black hover:text-red-600">{row.teamName}</Link></TableCell><TableCell>{row.capabilities.join(" + ") || "—"}</TableCell><TableCell>{row.returns.candidates}</TableCell><TableCell>{row.returns.ready}</TableCell><TableCell><span className={row.returns.review > 0 ? "font-black text-red-600" : "font-black text-black"}>{row.returns.review}</span></TableCell><TableCell><AdminStatusPill label={row.returns.review > 0 ? "Review" : row.returns.candidates > 0 ? "Ready" : "No activity"} tone={row.returns.review > 0 ? "danger" : row.returns.candidates > 0 ? "success" : "neutral"} /></TableCell></tr>)}</tbody></table></div></div>
      </AdminPanel>

      <AdminPanel eyebrow="Exception Signals" title="Loads currently needing review" description="The customer can correct these through its Returns exception workflow. Other valid Loads are not blocked from the preparation workbook.">
        {data.returnIssues.length === 0 ? <AdminEmptyState>No current-quarter Load exceptions were detected in the platform health view.</AdminEmptyState> : <div className="overflow-hidden rounded-2xl border border-black/10"><div className="overflow-x-auto"><table className="w-full min-w-[1100px] divide-y divide-black/10 text-sm"><thead><tr><TableHead>Organisation</TableHead><TableHead>Job / Load</TableHead><TableHead>Direction</TableHead><TableHead>Issues</TableHead></tr></thead><tbody className="divide-y divide-black/10">{data.returnIssues.slice(0, 50).map((row) => <tr key={row.jobLoadId} className="align-top hover:bg-red-50/30"><TableCell><Link href={`/admin/organisations/${row.organisationId}`} className="font-black text-black hover:text-red-600">{row.organisationName}</Link></TableCell><TableCell><span className="font-black text-black">{row.jobNumber}</span> · Load {row.loadNumber}</TableCell><TableCell>{row.direction}</TableCell><TableCell className="whitespace-normal"><div className="flex max-w-xl flex-wrap gap-1.5">{row.issues.map((issue) => <span key={issue} className="rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-bold text-red-700">{issue}</span>)}</div></TableCell></tr>)}</tbody></table></div></div>}
      </AdminPanel>
    </div>
  );
}
