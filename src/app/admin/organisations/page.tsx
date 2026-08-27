import Link from "next/link";

import { AdminMetric, AdminPageHeader, AdminPanel, AdminStatusPill, TableCell, TableHead } from "@/components/admin/AdminUi";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";
import { getAdminOrganisationSummaries } from "@/modules/admin/core/getAdminControlTowerData";
import { getAdminWorkflowHealth } from "@/modules/admin/core/getAdminWorkflowHealth";

import { ApproveButton, RejectButton } from "./ActionButton";
import { approveOrganisation, rejectOrganisation } from "./actions";

type PageProps = { searchParams?: { search?: string } };

export default async function AdminOrganisationsPage({ searchParams }: PageProps) {
  await requirePlatformAdmin();
  const search = searchParams?.search?.trim() ?? "";
  const [organisations, workflowData] = await Promise.all([
    getAdminOrganisationSummaries(search),
    getAdminWorkflowHealth(30),
  ]);

  const workflowByOrg = new Map(workflowData.organisations.map((row) => [row.id, row]));
  const active = organisations.filter((org) => org.status === "ACTIVE" && !org.isSuspended).length;
  const pending = organisations.filter((org) => org.status === "PENDING").length;
  const setupNeeded = organisations.filter((org) => {
    const health = workflowByOrg.get(org.id);
    return org.status === "ACTIVE" && !org.isSuspended && health && !health.setup.ready;
  }).length;
  const workflowAttention = organisations.filter((org) => (workflowByOrg.get(org.id)?.attentionSignals ?? 0) > 0).length;

  return (
    <div className="space-y-7">
      <AdminPageHeader eyebrow="Customers" title="Organisations" description="Approve customer organisations, understand their selected capabilities and monitor whether the workflows they actually use are healthy. Receiving-site and DWT setup is only treated as required for manager-capable organisations." actions={<><Link href="/admin/workflows" className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-bold text-white hover:border-red-500">Workflow Health</Link><Link href="/admin/users" className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700">Users & Access</Link></>} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminMetric label="Active" value={active} helper={`${organisations.length} organisations in current result`} />
        <AdminMetric label="Pending" value={pending} helper="Awaiting platform approval" danger={pending > 0} />
        <AdminMetric label="Setup attention" value={setupNeeded} helper="Capability-specific setup gaps" danger={setupNeeded > 0} />
        <AdminMetric label="Workflow attention" value={workflowAttention} helper="Returns, carbon, commercial or billing signals" danger={workflowAttention > 0} />
      </section>

      <AdminPanel eyebrow="Search" title="Find an organisation" description="Search by organisation name or email.">
        <form className="flex flex-col gap-3 md:flex-row"><input name="search" defaultValue={search} placeholder="Organisation name or email..." className="min-h-[3rem] flex-1 rounded-2xl border border-black/15 bg-white px-4 text-sm font-semibold text-black outline-none focus:border-red-500" /><button type="submit" className="rounded-2xl bg-black px-5 py-3 text-sm font-black text-white transition hover:bg-red-600">Search</button>{search ? <Link href="/admin/organisations" className="rounded-2xl border border-black/10 px-5 py-3 text-sm font-black text-black">Clear</Link> : null}</form>
      </AdminPanel>

      <AdminPanel eyebrow="Customer Register" title="Workspace setup, usage and product health" description="The organisation register now follows the current Waste X product rather than a one-size-fits-all receiving-site readiness score.">
        {organisations.length === 0 ? <div className="rounded-2xl border border-dashed border-black/15 p-7 text-sm font-semibold text-black/40">No organisations found.</div> : <div className="overflow-hidden rounded-2xl border border-black/10"><div className="overflow-x-auto"><table className="w-full min-w-[1750px] divide-y divide-black/10 text-sm"><thead><tr><TableHead>Organisation</TableHead><TableHead>Status</TableHead><TableHead>Capabilities</TableHead><TableHead>Plan</TableHead><TableHead>Setup</TableHead><TableHead>Jobs / Loads</TableHead><TableHead>Returns</TableHead><TableHead>CO₂e</TableHead><TableHead>Commercial</TableHead><TableHead>DWT</TableHead><TableHead>Last activity</TableHead><TableHead>Actions</TableHead></tr></thead><tbody className="divide-y divide-black/10 bg-white">{organisations.map((org) => {
          const health = workflowByOrg.get(org.id);
          return <tr key={org.id} className="transition hover:bg-red-50/30"><TableCell><div><Link href={`/admin/organisations/${org.id}`} className="font-black text-black hover:text-red-600">{org.teamName}</Link><p className="mt-1 text-xs text-black/35">{org.emailAddress}</p></div></TableCell><TableCell><AdminStatusPill label={org.isSuspended ? "Suspended" : org.status ?? "Unknown"} tone={org.status === "ACTIVE" && !org.isSuspended ? "success" : "danger"} /></TableCell><TableCell><div className="flex flex-wrap gap-1">{health?.capabilities.length ? health.capabilities.map((capability) => <span key={capability} className="rounded-full bg-black/5 px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-black/55">{capability}</span>) : "—"}</div></TableCell><TableCell>{formatLabel(org.subscriptionPlan ?? "starter")}</TableCell><TableCell>{health ? <AdminStatusPill label={`${health.setup.readyCount}/${health.setup.requiredCount}`} tone={health.setup.ready ? "success" : "danger"} /> : "—"}</TableCell><TableCell>{health ? `${health.operations.jobs} / ${health.operations.completedLoads}` : `${org.jobsCount} / ${org.loadsCount}`}</TableCell><TableCell>{health ? <span className={health.returns.review > 0 ? "font-black text-red-600" : "font-black text-black"}>{health.returns.ready} ready · {health.returns.review} review</span> : "—"}</TableCell><TableCell>{health ? <span className={health.carbon.attention > 0 ? "font-black text-red-600" : "font-black text-black"}>{health.carbon.coverage}% · {health.carbon.attention} issue</span> : "—"}</TableCell><TableCell>{health ? <span className={health.commercial.unpricedCompletedJobs > 0 ? "font-black text-red-600" : "font-black text-black"}>{health.commercial.invoiceReadyJobs} ready · {health.commercial.unpricedCompletedJobs} unpriced</span> : "—"}</TableCell><TableCell><span className={org.dwtFailures > 0 ? "font-black text-red-600" : "font-black text-black"}>{org.dwtCount}</span>{org.dwtFailures > 0 ? <span className="ml-1 text-xs text-red-500">({org.dwtFailures} issue)</span> : null}</TableCell><TableCell>{formatDate(org.lastActivity)}</TableCell><TableCell><div className="flex flex-wrap gap-2"><Link href={`/admin/organisations/${org.id}`} className="rounded-full bg-black px-3 py-1.5 text-xs font-black text-white hover:bg-red-600">View</Link>{org.status === "PENDING" ? <><form action={approveOrganisation}><input type="hidden" name="orgId" value={org.id} /><ApproveButton /></form><form action={rejectOrganisation}><input type="hidden" name="orgId" value={org.id} /><RejectButton /></form></> : null}</div></TableCell></tr>;
        })}</tbody></table></div></div>}
      </AdminPanel>
    </div>
  );
}

function formatDate(value: Date | string | null | undefined) { if (!value) return "—"; return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(value)); }
function formatLabel(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
