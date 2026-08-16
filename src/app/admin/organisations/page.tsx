import Link from "next/link";

import {
  AdminMetric,
  AdminPageHeader,
  AdminPanel,
  AdminStatusPill,
  TableCell,
  TableHead,
} from "@/components/admin/AdminUi";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";
import { getAdminOrganisationSummaries } from "@/modules/admin/core/getAdminControlTowerData";

import { ApproveButton, RejectButton } from "./ActionButton";
import { approveOrganisation, rejectOrganisation } from "./actions";

type PageProps = {
  searchParams?: { search?: string };
};

export default async function AdminOrganisationsPage({ searchParams }: PageProps) {
  await requirePlatformAdmin();
  const search = searchParams?.search?.trim() ?? "";
  const organisations = await getAdminOrganisationSummaries(search);

  const active = organisations.filter((org) => org.status === "ACTIVE" && !org.isSuspended).length;
  const pending = organisations.filter((org) => org.status === "PENDING").length;
  const setupNeeded = organisations.filter((org) => org.status === "ACTIVE" && org.readinessScore < 4).length;
  const dwtAttention = organisations.filter((org) => org.dwtFailures > 0).length;

  return (
    <div className="space-y-7">
      <AdminPageHeader
        eyebrow="Customers"
        title="Organisations"
        description="Approve customer organisations and monitor whether each Solo Waste Manager workspace is actually ready to operate. Platform admin observes and supports the tenant; it does not run customer jobs."
        actions={<Link href="/admin/users" className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700">Users</Link>}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminMetric label="Active" value={active} helper={`${organisations.length} organisations in current result`} />
        <AdminMetric label="Pending" value={pending} helper="Awaiting platform approval" danger={pending > 0} />
        <AdminMetric label="Setup needed" value={setupNeeded} helper="Active workspaces missing core setup" danger={setupNeeded > 0} />
        <AdminMetric label="DWT attention" value={dwtAttention} helper="Organisations with failed/rejected DWT attempts" danger={dwtAttention > 0} />
      </section>

      <AdminPanel eyebrow="Search" title="Find an organisation" description="Search by organisation name or email.">
        <form className="flex flex-col gap-3 md:flex-row">
          <input
            name="search"
            defaultValue={search}
            placeholder="Organisation name or email..."
            className="min-h-[3rem] flex-1 rounded-2xl border border-black/15 bg-white px-4 text-sm font-semibold text-black outline-none focus:border-red-500"
          />
          <button type="submit" className="rounded-2xl bg-black px-5 py-3 text-sm font-black text-white transition hover:bg-red-600">Search</button>
          {search ? <Link href="/admin/organisations" className="rounded-2xl border border-black/10 px-5 py-3 text-sm font-black text-black">Clear</Link> : null}
        </form>
      </AdminPanel>

      <AdminPanel
        eyebrow="Customer Register"
        title="Workspace readiness and usage"
        description="Site, permit, materials and DWT readiness are shown separately from approval status."
      >
        {organisations.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-black/15 p-7 text-sm font-semibold text-black/40">No organisations found.</div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-black/10">
            <div className="overflow-x-auto">
              <table className="min-w-[1250px] w-full divide-y divide-black/10 text-sm">
                <thead>
                  <tr>
                    <TableHead>Organisation</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Readiness</TableHead>
                    <TableHead>Users</TableHead>
                    <TableHead>Jobs</TableHead>
                    <TableHead>Loads</TableHead>
                    <TableHead>DWT</TableHead>
                    <TableHead>Last activity</TableHead>
                    <TableHead>Actions</TableHead>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/10 bg-white">
                  {organisations.map((org) => (
                    <tr key={org.id} className="transition hover:bg-red-50/30">
                      <TableCell>
                        <div>
                          <Link href={`/admin/organisations/${org.id}`} className="font-black text-black hover:text-red-600">{org.teamName}</Link>
                          <p className="mt-1 text-xs text-black/35">{org.emailAddress}</p>
                        </div>
                      </TableCell>
                      <TableCell><AdminStatusPill label={org.isSuspended ? "Suspended" : org.status ?? "Unknown"} tone={org.status === "ACTIVE" && !org.isSuspended ? "dark" : "danger"} /></TableCell>
                      <TableCell>{formatLabel(org.subscriptionPlan ?? "starter")}</TableCell>
                      <TableCell>
                        <div className="flex gap-1.5">
                          <Dot ok={org.hasReceivingSite} label="Site" />
                          <Dot ok={org.hasPermit} label="Permit" />
                          <Dot ok={org.hasMaterials} label="Materials" />
                          <Dot ok={org.dwtReady} label="DWT" />
                        </div>
                      </TableCell>
                      <TableCell>{org.activeMemberCount}/{org.memberCount}</TableCell>
                      <TableCell>{org.jobsCount}</TableCell>
                      <TableCell>{org.loadsCount}</TableCell>
                      <TableCell>
                        <span className={org.dwtFailures > 0 ? "font-black text-red-600" : "font-black text-black"}>{org.dwtCount}</span>
                        {org.dwtFailures > 0 ? <span className="ml-1 text-xs text-red-500">({org.dwtFailures} issue)</span> : null}
                      </TableCell>
                      <TableCell>{formatDate(org.lastActivity)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Link href={`/admin/organisations/${org.id}`} className="rounded-full bg-black px-3 py-1.5 text-xs font-black text-white hover:bg-red-600">View</Link>
                          {org.status === "PENDING" ? (
                            <>
                              <form action={approveOrganisation}><input type="hidden" name="orgId" value={org.id} /><ApproveButton /></form>
                              <form action={rejectOrganisation}><input type="hidden" name="orgId" value={org.id} /><RejectButton /></form>
                            </>
                          ) : null}
                        </div>
                      </TableCell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </AdminPanel>
    </div>
  );
}

function Dot({ ok, label }: { ok: boolean; label: string }) {
  return <span title={label} className={`size-3 rounded-full border ${ok ? "border-black bg-black" : "border-red-600 bg-red-600"}`} />;
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(value));
}

function formatLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
