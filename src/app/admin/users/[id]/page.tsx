import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminMetric, AdminPageHeader, AdminPanel, AdminStatusPill } from "@/components/admin/AdminUi";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";
import { getAdminUser } from "@/modules/admin/core/getAdminControlTowerData";
import { reactivateUser, suspendUser } from "../actions";

type PageProps = { params: { id: string } };

export default async function AdminUserDetailPage({ params }: PageProps) {
  await requirePlatformAdmin();
  const user = await getAdminUser(params.id);
  if (!user) notFound();

  const completedLoads = user.createdJobLoads.filter((load) => load.status === "completed").length;
  const dwtAccepted = user.wasteTrackingSubmissionsSubmitted.filter((row) => ["accepted", "accepted_with_warnings"].includes(row.status)).length;
  const dwtIssues = user.wasteTrackingSubmissionsSubmitted.filter((row) => ["rejected", "failed"].includes(row.status)).length;

  return (
    <div className="space-y-7">
      <AdminPageHeader eyebrow="Platform Access" title={user.name} description="User identity, customer organisation membership, access state and high-level platform activity." actions={<Link href="/admin/users" className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-bold text-white hover:border-red-500">← Users</Link>} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminMetric label="Role" value={formatLabel(user.role)} helper={user.organisation?.teamName ?? "Platform / unassigned"} />
        <AdminMetric label="Jobs created" value={user.createdJobs.length} helper="Customer-side job records created" />
        <AdminMetric label="Loads completed" value={completedLoads} helper={`${user.createdJobLoads.length} loads created`} />
        <AdminMetric label="DWT issues" value={dwtIssues} helper={`${dwtAccepted} accepted DWT attempts`} danger={dwtIssues > 0} />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <AdminPanel eyebrow="Account" title="Access details">
          <div className="space-y-3">
            <Info label="Email" value={user.email} />
            <Info label="Organisation" value={user.organisation?.teamName ?? "Not linked"} />
            <Info label="Role" value={formatLabel(user.role)} />
            <Info label="Status" value={user.isSuspended ? "Suspended" : user.status} />
            <Info label="Last seen" value={formatDateTime(user.lastSeenAt ?? user.lastLoginAt)} />
            <Info label="Joined" value={formatDateTime(user.createdAt)} />
          </div>
        </AdminPanel>

        <AdminPanel eyebrow="Control" title="Access action" description="Platform access controls only. Operational customer data is not edited here.">
          <div className="rounded-2xl border border-black/10 p-5">
            <AdminStatusPill label={user.isSuspended ? "Suspended" : "Access active"} tone={user.isSuspended ? "danger" : "dark"} />
            <p className="mt-4 text-sm leading-6 text-black/50">Suspension blocks user access. It does not delete historical jobs, loads, receipts, DWT records or audit history.</p>
            {user.role !== "platform_admin" ? (
              <div className="mt-5">
                {user.isSuspended ? (
                  <form action={reactivateUser.bind(null, user.id)}><button className="rounded-full bg-black px-5 py-2.5 text-sm font-black text-white hover:bg-red-600">Reactivate user</button></form>
                ) : (
                  <form action={suspendUser.bind(null, user.id)}><button className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-black text-white hover:bg-red-700">Suspend user</button></form>
                )}
              </div>
            ) : <p className="mt-5 text-xs font-black uppercase tracking-[0.16em] text-red-600">Platform admin protection — no suspension action shown here.</p>}
          </div>
        </AdminPanel>
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-4 rounded-2xl border border-black/10 px-4 py-3"><span className="text-xs font-black uppercase tracking-[0.14em] text-black/35">{label}</span><span className="text-sm font-black text-black">{value}</span></div>; }
function formatLabel(value: string) { return value.replaceAll("_", " ").replaceAll("-", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function formatDateTime(value: Date | string | null | undefined) { if (!value) return "—"; return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
