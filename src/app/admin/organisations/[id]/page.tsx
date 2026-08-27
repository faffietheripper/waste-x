import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminEmptyState, AdminMetric, AdminPageHeader, AdminPanel, AdminStatusPill, TableCell, TableHead } from "@/components/admin/AdminUi";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";
import { getAdminOrganisationOverview } from "@/modules/admin/core/getAdminControlTowerData";
import { getAdminOrganisationWorkflowHealth } from "@/modules/admin/core/getAdminWorkflowHealth";

type PageProps = { params: { id: string } };

export default async function AdminOrganisationDetailPage({ params }: PageProps) {
  await requirePlatformAdmin();
  const [org, workflow] = await Promise.all([
    getAdminOrganisationOverview(params.id),
    getAdminOrganisationWorkflowHealth(params.id, 90),
  ]);
  if (!org || !workflow.summary) notFound();

  const health = workflow.summary;
  const activeUsers = org.members.filter((member) => member.isActive && !member.isSuspended).length;
  const dwtAccepted = org.wasteTrackingSubmissions.filter((submission) => ["accepted", "accepted_with_warnings"].includes(submission.status)).length;
  const dwtFailures = org.wasteTrackingSubmissions.filter((submission) => ["rejected", "failed"].includes(submission.status)).length;

  return (
    <div className="space-y-7">
      <AdminPageHeader eyebrow="Customer Workspace" title={org.teamName} description="Platform support view across access, operational usage, compliance, Quarterly Returns, automatic Transport Emissions, Job-specific Commercials, customer invoicing and Waste X subscription billing. Customer Job/Load edits remain inside the customer workspace." actions={<><Link href="/admin/organisations" className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-bold text-white hover:border-red-500">← Organisations</Link><Link href="/admin/workflows" className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700">Workflow Health</Link></>} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <AdminMetric label="Status" value={org.isSuspended ? "Suspended" : org.status ?? "Unknown"} helper={`Mode: ${org.operatingMode}`} danger={org.isSuspended || org.status !== "ACTIVE"} />
        <AdminMetric label="Users" value={`${activeUsers}/${org.members.length}`} helper="Active / total" />
        <AdminMetric label="Jobs · 90d" value={health.operations.jobs} helper={`${health.operations.completedJobs} completed`} />
        <AdminMetric label="Completed Loads" value={health.operations.completedLoads} helper={`${health.operations.tonnes.toFixed(3)} tonnes`} />
        <AdminMetric label="Workflow attention" value={health.attentionSignals} helper="Returns + carbon + commercial + billing" danger={health.attentionSignals > 0} />
        <AdminMetric label="DWT issues" value={dwtFailures} helper={`${dwtAccepted} accepted attempts`} danger={dwtFailures > 0} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <AdminPanel eyebrow="Workspace Setup" title="Capability-aware readiness" description="Only checks required by the organisation's selected capabilities are treated as blockers.">
          <div className="mb-4 flex flex-wrap gap-2">{health.capabilities.length ? health.capabilities.map((capability) => <AdminStatusPill key={capability} label={capability} tone="dark" />) : <AdminStatusPill label="No capability" tone="danger" />}</div>
          <div className="space-y-3">{health.setup.checks.map((check) => <div key={check.key} className="flex items-center justify-between gap-4 rounded-2xl border border-black/10 px-4 py-3"><div className="flex items-center gap-3"><span className={`size-3 rounded-full ${check.ok ? "bg-emerald-600" : "bg-red-600"}`} /><div><p className="text-sm font-bold text-black">{check.label}</p><p className="mt-1 text-[10px] text-black/40">{check.helper}</p></div></div><AdminStatusPill label={check.ok ? "Ready" : "Review"} tone={check.ok ? "success" : "danger"} /></div>)}</div>
        </AdminPanel>

        <AdminPanel eyebrow="Customer Record" title="Organisation information">
          <div className="grid gap-4 sm:grid-cols-2"><Info label="Email" value={org.emailAddress} /><Info label="Telephone" value={org.telephone} /><Info label="Industry" value={org.industry ?? "Not recorded"} /><Info label="Plan" value={formatLabel(org.subscriptionPlan ?? "starter")} /><Info label="Subscription" value={formatLabel(org.subscriptionStatus ?? "trial")} /><Info label="Joined" value={formatDate(org.createdAt)} /><Info label="Address" value={[org.streetAddress, org.city, org.region, org.postCode].filter(Boolean).join(", ")} wide /></div>
        </AdminPanel>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <AdminPanel eyebrow="Quarterly Returns" title={workflow.quarter.label} action={<Link href="/admin/quarterly-returns" className="text-xs font-black text-red-600">Platform view →</Link>}><div className="space-y-3"><Row label="Candidate Loads" value={health.returns.candidates} /><Row label="Ready" value={health.returns.ready} /><Row label="Needs review" value={health.returns.review} danger={health.returns.review > 0} /></div>{workflow.returnIssues.length > 0 ? <p className="mt-4 text-xs leading-5 text-red-700">Latest: {workflow.returnIssues[0]?.issues.join(" · ")}</p> : null}</AdminPanel>
        <AdminPanel eyebrow="Transport Emissions" title="Automatic route coverage" action={<Link href="/admin/transport-emissions" className="text-xs font-black text-red-600">Platform view →</Link>}><div className="space-y-3"><Row label="Eligible" value={health.carbon.eligible} /><Row label="Calculated" value={`${health.carbon.calculated} · ${health.carbon.coverage}%`} /><Row label="Pending" value={health.carbon.pending} /><Row label="Needs attention" value={health.carbon.attention} danger={health.carbon.attention > 0} /></div></AdminPanel>
        <AdminPanel eyebrow="Commercial" title="Job pricing & invoices" action={<Link href="/admin/commercial" className="text-xs font-black text-red-600">Platform view →</Link>}><div className="space-y-3"><Row label="Priced completed Jobs" value={health.commercial.pricedCompletedJobs} /><Row label="Unpriced completed Jobs" value={health.commercial.unpricedCompletedJobs} danger={health.commercial.unpricedCompletedJobs > 0} /><Row label="Invoice-ready Jobs" value={health.commercial.invoiceReadyJobs} /><Row label="Customer invoices" value={`${health.customerInvoices.draft} draft · ${health.customerInvoices.issued} issued · ${health.customerInvoices.paid} paid`} /></div></AdminPanel>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <AdminPanel eyebrow="Users" title="Customer access"><div className="overflow-hidden rounded-2xl border border-black/10"><div className="overflow-x-auto"><table className="min-w-full divide-y divide-black/10 text-sm"><thead><tr><TableHead>User</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead>Last seen</TableHead><TableHead>Action</TableHead></tr></thead><tbody className="divide-y divide-black/10">{org.members.map((member) => <tr key={member.id}><TableCell><div><p className="font-black text-black">{member.name}</p><p className="mt-1 text-xs text-black/35">{member.email}</p></div></TableCell><TableCell>{formatLabel(member.role)}</TableCell><TableCell><AdminStatusPill label={member.isSuspended ? "Suspended" : member.status} tone={member.isSuspended ? "danger" : "success"} /></TableCell><TableCell>{formatDate(member.lastSeenAt ?? member.lastLoginAt)}</TableCell><TableCell><Link href={`/admin/users/${member.id}`} className="rounded-full bg-black px-3 py-1.5 text-xs font-black text-white hover:bg-red-600">View user</Link></TableCell></tr>)}</tbody></table></div></div></AdminPanel>
        <AdminPanel eyebrow="Platform Billing" title="Waste X subscription" description="This is the organisation's billing relationship with Waste X, not its customer invoices." action={<Link href="/admin/billing" className="text-xs font-black text-red-600">Platform Billing →</Link>}><div className="space-y-3"><Row label="Plan" value={formatLabel(org.subscriptionPlan ?? "starter")} /><Row label="Subscription" value={formatLabel(org.subscriptionStatus ?? "trial")} danger={org.subscriptionStatus === "past_due"} /><Row label="Platform invoices · 90d" value={health.platformBilling.platformInvoices} /><Row label="Failed" value={health.platformBilling.failed} danger={health.platformBilling.failed > 0} /><Row label="Paid value" value={money(health.platformBilling.paidValue)} /></div></AdminPanel>
      </section>

      <AdminPanel eyebrow="Digital Waste Tracking" title="DWT organisation health" action={<Link href="/admin/digital-waste-tracking" className="text-xs font-black text-red-600">DWT Control →</Link>}>
        <div className="grid gap-4 md:grid-cols-4"><Mini label="Enabled" value={org.wasteTrackingSettings?.isEnabled ? "Yes" : "No"} danger={!org.wasteTrackingSettings?.isEnabled} /><Mini label="API code" value={org.wasteTrackingSettings?.apiCode ? "Configured" : "Missing"} danger={!org.wasteTrackingSettings?.apiCode} /><Mini label="Accepted" value={dwtAccepted} /><Mini label="Rejected / failed" value={dwtFailures} danger={dwtFailures > 0} /></div>
        {org.wasteTrackingSubmissions.length === 0 ? <div className="mt-5"><AdminEmptyState>No DWT attempts recorded.</AdminEmptyState></div> : <div className="mt-5 space-y-2">{org.wasteTrackingSubmissions.slice(0, 8).map((submission) => <div key={submission.id} className="flex flex-col gap-2 rounded-2xl border border-black/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex flex-wrap items-center gap-2"><AdminStatusPill label={formatLabel(submission.status)} tone={["rejected", "failed"].includes(submission.status) ? "danger" : "success"} />{submission.wasteTrackingId ? <span className="text-xs font-bold text-black/50">WTID {submission.wasteTrackingId}</span> : null}</div><span className="text-xs font-semibold text-black/35">{formatDate(submission.createdAt)}</span></div>)}</div>}
      </AdminPanel>
    </div>
  );
}

function Row({ label, value, danger = false }: { label: string; value: string | number; danger?: boolean }) { return <div className="flex items-center justify-between gap-4 rounded-2xl border border-black/10 px-4 py-3"><span className="text-sm font-semibold text-black/50">{label}</span><span className={`text-right text-sm font-black ${danger ? "text-red-600" : "text-black"}`}>{value}</span></div>; }
function Info({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) { return <div className={`rounded-2xl border border-black/10 p-4 ${wide ? "sm:col-span-2" : ""}`}><p className="text-[9px] font-black uppercase tracking-[0.16em] text-black/35">{label}</p><p className="mt-2 text-sm font-black text-black">{value || "—"}</p></div>; }
function Mini({ label, value, danger = false }: { label: string; value: string | number; danger?: boolean }) { return <div className={`rounded-2xl border p-4 ${danger ? "border-red-200 bg-red-50" : "border-black/10"}`}><p className="text-[9px] font-black uppercase tracking-[0.16em] text-black/35">{label}</p><p className={`mt-2 text-xl font-black ${danger ? "text-red-600" : "text-black"}`}>{value}</p></div>; }
function formatLabel(value: string) { return value.replaceAll("_", " ").replaceAll("-", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function formatDate(value: Date | string | null | undefined) { if (!value) return "—"; return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(value)); }
function money(value: number) { return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value); }
