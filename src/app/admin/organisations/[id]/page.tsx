import Link from "next/link";
import { notFound } from "next/navigation";

import {
  AdminMetric,
  AdminPageHeader,
  AdminPanel,
  AdminStatusPill,
  TableCell,
  TableHead,
} from "@/components/admin/AdminUi";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";
import { getAdminOrganisationOverview } from "@/modules/admin/core/getAdminControlTowerData";

type PageProps = { params: { id: string } };

export default async function AdminOrganisationDetailPage({ params }: PageProps) {
  await requirePlatformAdmin();
  const org = await getAdminOrganisationOverview(params.id);
  if (!org) notFound();

  const receivingSites = org.sites.filter((site) => site.siteType === "waste_receiving_site" && site.status === "active");
  const primaryPermits = org.sitePermits.filter((permit) => permit.status === "active" && permit.isPrimary);
  const permittedEwcCount = primaryPermits.reduce((total, permit) => total + permit.permittedEwcCodes.length, 0);
  const activeMaterials = org.materialProfiles.filter((material) => material.isActive).length;
  const activeUsers = org.members.filter((member) => member.isActive && !member.isSuspended).length;
  const completedLoads = org.jobLoads.filter((load) => load.status === "completed").length;
  const dwtAccepted = org.wasteTrackingSubmissions.filter((submission) => ["accepted", "accepted_with_warnings"].includes(submission.status)).length;
  const dwtFailures = org.wasteTrackingSubmissions.filter((submission) => ["rejected", "failed"].includes(submission.status)).length;
  const dwtReady = Boolean(org.wasteTrackingSettings?.isEnabled && org.wasteTrackingSettings?.apiCode);

  return (
    <div className="space-y-7">
      <AdminPageHeader
        eyebrow="Customer Workspace"
        title={org.teamName}
        description="Platform-level customer oversight. This page shows readiness, usage and DWT health without giving platform admins an operational customer workspace."
        actions={
          <>
            <Link href="/admin/organisations" className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-bold text-white hover:border-red-500">← Organisations</Link>
            <Link href="/admin/digital-waste-tracking" className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700">DWT Control</Link>
          </>
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <AdminMetric label="Status" value={org.isSuspended ? "Suspended" : org.status ?? "Unknown"} helper={`Workspace mode: ${org.operatingMode}`} danger={org.isSuspended || org.status !== "ACTIVE"} />
        <AdminMetric label="Users" value={`${activeUsers}/${org.members.length}`} helper="Active / total customer users" />
        <AdminMetric label="Jobs" value={org.jobs.length} helper="Jobs recorded in this workspace" />
        <AdminMetric label="Completed loads" value={completedLoads} helper={`${org.jobLoads.length} total loads`} />
        <AdminMetric label="DWT issues" value={dwtFailures} helper={`${dwtAccepted} accepted attempts`} danger={dwtFailures > 0} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <AdminPanel eyebrow="Readiness" title="Solo Waste Manager setup" description="These checks explain whether the customer can run the core MVP workflow.">
          <div className="space-y-3">
            <ReadinessRow label="Active receiving site" ok={receivingSites.length > 0} value={receivingSites.length > 0 ? receivingSites[0]?.name ?? "Configured" : "Missing"} />
            <ReadinessRow label="Primary active permit" ok={primaryPermits.length > 0} value={primaryPermits.length > 0 ? primaryPermits[0]?.permitNumber ?? "Configured" : "Missing"} />
            <ReadinessRow label="Permitted EWC links" ok={permittedEwcCount > 0} value={`${permittedEwcCount}`} />
            <ReadinessRow label="Active material profiles" ok={activeMaterials > 0} value={`${activeMaterials}`} />
            <ReadinessRow label="DWT enabled + API code" ok={dwtReady} value={dwtReady ? "Ready" : "Needs setup"} />
            <ReadinessRow label="Active customer user" ok={activeUsers > 0} value={`${activeUsers}`} />
          </div>
        </AdminPanel>

        <AdminPanel eyebrow="Customer Record" title="Organisation information" description="Commercial account metadata and customer contact information.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Info label="Email" value={org.emailAddress} />
            <Info label="Telephone" value={org.telephone} />
            <Info label="Industry" value={org.industry ?? "Not recorded"} />
            <Info label="Plan" value={formatLabel(org.subscriptionPlan ?? "starter")} />
            <Info label="Subscription" value={formatLabel(org.subscriptionStatus ?? "trial")} />
            <Info label="Joined" value={formatDate(org.createdAt)} />
            <Info label="Address" value={[org.streetAddress, org.city, org.region, org.postCode].filter(Boolean).join(", ")} wide />
          </div>
        </AdminPanel>
      </section>

      <AdminPanel eyebrow="Users" title="Customer access" description="Platform admins can inspect user access. Customer operational permissions remain controlled by the customer workspace.">
        <div className="overflow-hidden rounded-2xl border border-black/10">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-black/10 text-sm">
              <thead><tr><TableHead>User</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead>Last seen</TableHead><TableHead>Action</TableHead></tr></thead>
              <tbody className="divide-y divide-black/10">
                {org.members.map((member) => (
                  <tr key={member.id}>
                    <TableCell><div><p className="font-black text-black">{member.name}</p><p className="mt-1 text-xs text-black/35">{member.email}</p></div></TableCell>
                    <TableCell>{formatLabel(member.role)}</TableCell>
                    <TableCell><AdminStatusPill label={member.isSuspended ? "Suspended" : member.status} tone={member.isSuspended ? "danger" : "dark"} /></TableCell>
                    <TableCell>{formatDate(member.lastSeenAt ?? member.lastLoginAt)}</TableCell>
                    <TableCell><Link href={`/admin/users/${member.id}`} className="rounded-full bg-black px-3 py-1.5 text-xs font-black text-white hover:bg-red-600">View user</Link></TableCell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </AdminPanel>

      <AdminPanel eyebrow="Digital Waste Tracking" title="DWT organisation health" description="Read-only summary. Submission Control and PAT remain untouched in the protected DWT admin area." action={<Link href="/admin/digital-waste-tracking" className="text-xs font-black text-red-600">Open DWT Control →</Link>}>
        <div className="grid gap-4 md:grid-cols-4">
          <Mini label="Enabled" value={org.wasteTrackingSettings?.isEnabled ? "Yes" : "No"} danger={!org.wasteTrackingSettings?.isEnabled} />
          <Mini label="API code" value={org.wasteTrackingSettings?.apiCode ? "Configured" : "Missing"} danger={!org.wasteTrackingSettings?.apiCode} />
          <Mini label="Accepted" value={dwtAccepted} />
          <Mini label="Rejected / failed" value={dwtFailures} danger={dwtFailures > 0} />
        </div>
        <div className="mt-5 space-y-2">
          {org.wasteTrackingSubmissions.slice(0, 8).map((submission) => (
            <div key={submission.id} className="flex flex-col gap-2 rounded-2xl border border-black/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <AdminStatusPill label={formatLabel(submission.status)} tone={["rejected", "failed"].includes(submission.status) ? "danger" : "dark"} />
                {submission.wasteTrackingId ? <span className="text-xs font-bold text-black/50">WTID {submission.wasteTrackingId}</span> : null}
              </div>
              <span className="text-xs font-semibold text-black/35">{formatDate(submission.createdAt)}</span>
            </div>
          ))}
        </div>
      </AdminPanel>
    </div>
  );
}

function ReadinessRow({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return <div className="flex items-center justify-between rounded-2xl border border-black/10 px-4 py-3"><div className="flex items-center gap-3"><span className={`size-3 rounded-full ${ok ? "bg-black" : "bg-red-600"}`} /><span className="text-sm font-bold text-black">{label}</span></div><span className={ok ? "text-sm font-black text-black" : "text-sm font-black text-red-600"}>{value}</span></div>;
}
function Info({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) { return <div className={`rounded-2xl border border-black/10 p-4 ${wide ? "sm:col-span-2" : ""}`}><p className="text-[9px] font-black uppercase tracking-[0.16em] text-black/35">{label}</p><p className="mt-2 text-sm font-black text-black">{value || "—"}</p></div>; }
function Mini({ label, value, danger = false }: { label: string; value: string | number; danger?: boolean }) { return <div className={`rounded-2xl border p-4 ${danger ? "border-red-200 bg-red-50" : "border-black/10"}`}><p className="text-[9px] font-black uppercase tracking-[0.16em] text-black/35">{label}</p><p className={`mt-2 text-xl font-black ${danger ? "text-red-600" : "text-black"}`}>{value}</p></div>; }
function formatLabel(value: string) { return value.replaceAll("_", " ").replaceAll("-", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function formatDate(value: Date | string | null | undefined) { if (!value) return "—"; return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(value)); }
