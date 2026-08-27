import Link from "next/link";

import { AdminMetric, AdminPageHeader, AdminPanel, AdminStatusPill, TableCell, TableHead } from "@/components/admin/AdminUi";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";
import { getAdminUsers } from "@/modules/admin/core/getAdminControlTowerData";
import { reactivateUser, suspendUser } from "./actions";

type PageProps = { searchParams?: { search?: string } };

export default async function AdminUsersPage({ searchParams }: PageProps) {
  await requirePlatformAdmin();
  const search = searchParams?.search?.trim() ?? "";
  const rows = await getAdminUsers(search);

  const active = rows.filter((user) => user.isActive && !user.isSuspended).length;
  const invited = rows.filter((user) => user.status === "INVITED").length;
  const suspended = rows.filter((user) => user.isSuspended).length;
  const admins = rows.filter((user) => user.role === "platform_admin").length;

  return (
    <div className="space-y-7">
      <AdminPageHeader eyebrow="Customers" title="Users & Access" description="Platform-wide customer access, organisation membership and account status. Organisation capabilities and operational workflows are separate from user access roles." actions={<Link href="/admin/organisations" className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700">Organisations</Link>} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><AdminMetric label="Active" value={active} helper={`${rows.length} users in current result`} /><AdminMetric label="Invited" value={invited} helper="Invitations not yet completed" danger={invited > 0} /><AdminMetric label="Suspended" value={suspended} helper="Access restricted" danger={suspended > 0} /><AdminMetric label="Platform admins" value={admins} helper="Waste X control-plane access" /></section>

      <AdminPanel eyebrow="Search" title="Find a user" description="Search by user name or email address."><form className="flex flex-col gap-3 md:flex-row"><input name="search" defaultValue={search} placeholder="Name or email..." className="min-h-[3rem] flex-1 rounded-2xl border border-black/15 px-4 text-sm font-semibold outline-none focus:border-red-500" /><button className="rounded-2xl bg-black px-5 py-3 text-sm font-black text-white hover:bg-red-600">Search</button>{search ? <Link href="/admin/users" className="rounded-2xl border border-black/10 px-5 py-3 text-sm font-black text-black">Clear</Link> : null}</form></AdminPanel>

      <AdminPanel eyebrow="Access Register" title="Platform users" description="Customer administrators/employees and Waste X platform administrators are visible here. Legacy role values remain readable for migration compatibility.">
        <div className="overflow-hidden rounded-2xl border border-black/10"><div className="overflow-x-auto"><table className="w-full min-w-[1050px] divide-y divide-black/10 text-sm"><thead><tr><TableHead>User</TableHead><TableHead>Organisation</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead>Last seen</TableHead><TableHead>Joined</TableHead><TableHead>Actions</TableHead></tr></thead><tbody className="divide-y divide-black/10">{rows.map((user) => <tr key={user.id} className="hover:bg-red-50/30"><TableCell><div><Link href={`/admin/users/${user.id}`} className="font-black text-black hover:text-red-600">{user.name}</Link><p className="mt-1 text-xs text-black/35">{user.email}</p></div></TableCell><TableCell>{user.organisation?.teamName ?? "Platform / unassigned"}</TableCell><TableCell><AdminStatusPill label={formatLabel(user.role)} tone={user.role === "platform_admin" ? "danger" : "neutral"} /></TableCell><TableCell><AdminStatusPill label={user.isSuspended ? "Suspended" : user.status} tone={user.isSuspended ? "danger" : "success"} /></TableCell><TableCell>{formatDate(user.lastSeenAt ?? user.lastLoginAt)}</TableCell><TableCell>{formatDate(user.createdAt)}</TableCell><TableCell><div className="flex gap-2"><Link href={`/admin/users/${user.id}`} className="rounded-full bg-black px-3 py-1.5 text-xs font-black text-white hover:bg-red-600">View</Link>{user.role !== "platform_admin" ? user.isSuspended ? <form action={reactivateUser.bind(null, user.id)}><button className="rounded-full border border-black/15 px-3 py-1.5 text-xs font-black text-black">Reactivate</button></form> : <form action={suspendUser.bind(null, user.id)}><button className="rounded-full border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-black text-red-700">Suspend</button></form> : null}</div></TableCell></tr>)}</tbody></table></div></div>
      </AdminPanel>
    </div>
  );
}

function formatLabel(value: string) { return value.replaceAll("_", " ").replaceAll("-", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function formatDate(value: Date | string | null | undefined) { if (!value) return "—"; return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(value)); }
