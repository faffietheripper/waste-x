import Link from "next/link";
import { desc } from "drizzle-orm";

import { database } from "@/db/database";
import { supportTickets } from "@/db/schema";
import { AdminMetric, AdminPageHeader, AdminPanel, AdminStatusPill, TableCell, TableHead } from "@/components/admin/AdminUi";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";

export default async function AdminSupportPage() {
  await requirePlatformAdmin();

  const tickets = await database.query.supportTickets.findMany({
    with: { organisation: true, assignedTo: true, createdBy: true },
    orderBy: [desc(supportTickets.updatedAt)],
  });

  const active = tickets.filter((ticket) => !["resolved", "closed"].includes(ticket.status));
  const urgent = active.filter((ticket) => ticket.priority === "urgent");
  const unassigned = active.filter((ticket) => !ticket.assignedToUserId);
  const waiting = active.filter((ticket) => ticket.status === "waiting_on_user");

  return (
    <div className="space-y-7">
      <AdminPageHeader eyebrow="Platform Operations" title="Support" description="Customer support queue across Waste X organisations. Existing ticket detail and response actions remain in place; this rebuild changes the admin control surface, not support history." actions={<Link href="/admin/alerts" className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700">Alerts</Link>} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminMetric label="Active" value={active.length} helper={`${tickets.length} total tickets`} danger={active.length > 0} />
        <AdminMetric label="Urgent" value={urgent.length} helper="Highest priority customer issues" danger={urgent.length > 0} />
        <AdminMetric label="Unassigned" value={unassigned.length} helper="No platform admin assigned" danger={unassigned.length > 0} />
        <AdminMetric label="Waiting on user" value={waiting.length} helper="Customer response required" />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <AdminPanel eyebrow="Priority Queue" title="Needs attention" description="Urgent, high-priority and unassigned active tickets are surfaced first.">
          {active.length === 0 ? <Empty text="No active support tickets." /> : (
            <div className="space-y-3">
              {[...active]
                .sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority))
                .slice(0, 8)
                .map((ticket) => <Ticket key={ticket.id} ticket={ticket} />)}
            </div>
          )}
        </AdminPanel>

        <AdminPanel eyebrow="Recently Updated" title="Latest customer conversations" description="Most recently updated tickets across the platform.">
          {tickets.length === 0 ? <Empty text="No support tickets recorded." /> : (
            <div className="space-y-3">{tickets.slice(0, 8).map((ticket) => <Ticket key={ticket.id} ticket={ticket} />)}</div>
          )}
        </AdminPanel>
      </section>

      <AdminPanel eyebrow="Ticket Register" title="All support tickets" description="Open a ticket to use the existing response, assignment and status workflow.">
        <div className="overflow-hidden rounded-2xl border border-black/10">
          <div className="overflow-x-auto">
            <table className="min-w-[1000px] w-full divide-y divide-black/10 text-sm">
              <thead><tr><TableHead>Ticket</TableHead><TableHead>Organisation</TableHead><TableHead>Priority</TableHead><TableHead>Status</TableHead><TableHead>Assigned</TableHead><TableHead>Updated</TableHead><TableHead>Action</TableHead></tr></thead>
              <tbody className="divide-y divide-black/10">
                {tickets.map((ticket) => (
                  <tr key={ticket.id} className="hover:bg-red-50/30">
                    <TableCell><div><p className="font-black text-black">{formatLabel(ticket.category)}</p><p className="mt-1 text-xs text-black/35">#{ticket.id.slice(0, 8)}</p></div></TableCell>
                    <TableCell>{ticket.organisation?.teamName ?? "Unknown"}</TableCell>
                    <TableCell><AdminStatusPill label={ticket.priority} tone={["urgent", "high"].includes(ticket.priority) ? "danger" : "neutral"} /></TableCell>
                    <TableCell><AdminStatusPill label={formatLabel(ticket.status)} tone={ticket.status === "open" ? "danger" : "dark"} /></TableCell>
                    <TableCell>{ticket.assignedTo?.name ?? "Unassigned"}</TableCell>
                    <TableCell>{formatDate(ticket.updatedAt)}</TableCell>
                    <TableCell><Link href={`/admin/support/${ticket.id}`} className="rounded-full bg-black px-3 py-1.5 text-xs font-black text-white hover:bg-red-600">Open</Link></TableCell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </AdminPanel>
    </div>
  );
}

function Ticket({ ticket }: { ticket: any }) {
  return (
    <Link href={`/admin/support/${ticket.id}`} className="block rounded-2xl border border-black/10 p-4 transition hover:border-red-300 hover:bg-red-50/30">
      <div className="flex items-start justify-between gap-4">
        <div><p className="text-sm font-black text-black">{formatLabel(ticket.category)}</p><p className="mt-1 text-xs text-black/40">{ticket.organisation?.teamName ?? "Unknown organisation"} · {ticket.createdBy?.name ?? "Unknown user"}</p></div>
        <AdminStatusPill label={ticket.priority} tone={["urgent", "high"].includes(ticket.priority) ? "danger" : "neutral"} />
      </div>
      <p className="mt-3 text-xs font-semibold text-black/35">{formatLabel(ticket.status)} · Updated {formatDate(ticket.updatedAt)}</p>
    </Link>
  );
}
function Empty({ text }: { text: string }) { return <div className="rounded-2xl border border-dashed border-black/15 p-6 text-sm font-semibold text-black/40">{text}</div>; }
function priorityRank(value: string) { return value === "urgent" ? 4 : value === "high" ? 3 : value === "medium" ? 2 : 1; }
function formatLabel(value: string) { return value.replaceAll("_", " ").replaceAll("-", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function formatDate(value: Date | string | null | undefined) { if (!value) return "—"; return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
