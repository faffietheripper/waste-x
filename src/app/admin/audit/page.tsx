import Link from "next/link";

import { AdminMetric, AdminPageHeader, AdminPanel, AdminStatusPill, TableCell, TableHead } from "@/components/admin/AdminUi";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";
import { getAdminAuditFeed } from "@/modules/admin/core/getAdminControlTowerData";

type PageProps = { searchParams?: { q?: string } };

export default async function AdminAuditPage({ searchParams }: PageProps) {
  await requirePlatformAdmin();
  const events = await getAdminAuditFeed(250);
  const query = searchParams?.q?.trim().toLowerCase() ?? "";
  const visible = query ? events.filter((event) => [event.action, event.entityType, event.entityId, event.organisation?.teamName, event.user?.name, event.user?.email].some((value) => value?.toLowerCase().includes(query))) : events;
  const organisations = new Set(visible.map((event) => event.organisationId)).size;
  const users = new Set(visible.map((event) => event.userId).filter(Boolean)).size;
  const today = visible.filter((event) => event.createdAt && isToday(event.createdAt)).length;

  return (
    <div className="space-y-7">
      <AdminPageHeader eyebrow="Governance" title="Activity & Audit" description="Cross-platform audit events for the current Waste X operations platform — including Jobs, Loads, DWT, reporting, commercial, invoicing and transport-emissions actions as they enter the shared audit stream." actions={<Link href="/admin/reports" className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700">Platform Reports</Link>} />
      <section className="grid gap-4 md:grid-cols-3"><AdminMetric label="Events" value={visible.length} helper="Current audit result set" /><AdminMetric label="Organisations" value={organisations} helper="Organisations represented" /><AdminMetric label="Today" value={today} helper={`${users} users represented`} /></section>
      <AdminPanel eyebrow="Search" title="Search audit history" description="Search by action, entity, organisation, user name or email."><form className="flex flex-col gap-3 md:flex-row"><input name="q" defaultValue={searchParams?.q ?? ""} placeholder="Search audit history..." className="min-h-[3rem] flex-1 rounded-2xl border border-black/15 px-4 text-sm font-semibold outline-none focus:border-red-500" /><button className="rounded-2xl bg-black px-5 py-3 text-sm font-black text-white hover:bg-red-600">Search</button>{query ? <Link href="/admin/audit" className="rounded-2xl border border-black/10 px-5 py-3 text-sm font-black text-black">Clear</Link> : null}</form></AdminPanel>
      <AdminPanel eyebrow="Audit Trail" title="Platform events" description="Human-readable event metadata is shown here; previous/new state JSON remains in the database for deeper investigation.">{visible.length === 0 ? <div className="rounded-2xl border border-dashed border-black/15 p-6 text-sm font-semibold text-black/40">No audit events match this search.</div> : <div className="overflow-hidden rounded-2xl border border-black/10"><div className="overflow-x-auto"><table className="w-full min-w-[1100px] divide-y divide-black/10 text-sm"><thead><tr><TableHead>Time</TableHead><TableHead>Organisation</TableHead><TableHead>User</TableHead><TableHead>Action</TableHead><TableHead>Entity</TableHead><TableHead>Entity ID</TableHead></tr></thead><tbody className="divide-y divide-black/10">{visible.map((event) => <tr key={event.id} className="hover:bg-red-50/30"><TableCell>{formatDate(event.createdAt)}</TableCell><TableCell>{event.organisation?.teamName ?? "Platform"}</TableCell><TableCell>{event.user?.name ?? event.user?.email ?? "System"}</TableCell><TableCell><AdminStatusPill label={formatLabel(event.action)} tone="dark" /></TableCell><TableCell>{formatLabel(event.entityType)}</TableCell><TableCell><span className="font-mono text-xs text-black/45">{event.entityId}</span></TableCell></tr>)}</tbody></table></div></div>}</AdminPanel>
    </div>
  );
}

function isToday(value: Date | string) { const date = new Date(value); const now = new Date(); return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate(); }
function formatLabel(value: string) { return value.replaceAll("_", " ").replaceAll("-", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function formatDate(value: Date | string | null | undefined) { if (!value) return "—"; return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
