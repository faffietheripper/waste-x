import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";

import {
  AdminMetric,
  AdminPageHeader,
  AdminPanel,
  AdminStatusPill,
} from "@/components/admin/AdminUi";
import { database } from "@/db/database";
import {
  supportTicketMessages,
  supportTickets,
  users,
} from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";

import {
  addInternalSupportNoteAction,
  assignSupportTicketAction,
  replySupportTicketAction,
  setSupportTicketStatusAction,
} from "../actions";

type PageProps = {
  params: {
    ticketId: string;
  };
};

export default async function AdminSupportTicketDetailPage({
  params,
}: PageProps) {
  await requirePlatformAdmin();

  const ticket = await database.query.supportTickets.findFirst({
    where: eq(supportTickets.id, params.ticketId),
    with: {
      organisation: true,
      createdBy: true,
      assignedTo: true,
    },
  });

  if (!ticket) notFound();

  const [messages, platformAdmins] = await Promise.all([
    database
      .select({
        id: supportTicketMessages.id,
        senderUserId: supportTicketMessages.senderUserId,
        message: supportTicketMessages.message,
        isInternalNote: supportTicketMessages.isInternalNote,
        createdAt: supportTicketMessages.createdAt,
        senderName: users.name,
        senderEmail: users.email,
        senderRole: users.role,
      })
      .from(supportTicketMessages)
      .leftJoin(users, eq(supportTicketMessages.senderUserId, users.id))
      .where(eq(supportTicketMessages.ticketId, ticket.id))
      .orderBy(asc(supportTicketMessages.createdAt)),

    database.query.users.findMany({
      where: eq(users.role, "platform_admin"),
      columns: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        isSuspended: true,
      },
    }),
  ]);

  const publicMessages = messages.filter((message) => !message.isInternalNote);
  const internalNotes = messages.filter((message) => message.isInternalNote);
  const closed = ticket.status === "resolved" || ticket.status === "closed";

  return (
    <div className="space-y-7">
      <AdminPageHeader
        eyebrow="Platform Support"
        title={`${formatLabel(ticket.category)} · #${ticket.id.slice(0, 8)}`}
        description="Canonical customer support conversation with platform-only internal notes. Internal notes are never returned by the customer Desktop support API."
        actions={
          <>
            <Link
              href="/admin/support"
              className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-bold text-white hover:border-red-500"
            >
              ← Support
            </Link>
            <Link
              href={`/admin/organisations/${ticket.organisationId}`}
              className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700"
            >
              Organisation
            </Link>
          </>
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <AdminMetric
          label="Status"
          value={formatLabel(ticket.status)}
          helper={`Priority: ${formatLabel(ticket.priority)}`}
          danger={ticket.priority === "urgent"}
        />
        <AdminMetric
          label="Public messages"
          value={publicMessages.length}
          helper="Visible to the customer"
        />
        <AdminMetric
          label="Internal notes"
          value={internalNotes.length}
          helper="Platform-only"
        />
        <AdminMetric
          label="Assigned"
          value={ticket.assignedTo?.name ?? "Unassigned"}
          helper="Platform owner"
        />
        <AdminMetric
          label="Updated"
          value={formatCompact(ticket.updatedAt)}
          helper={ticket.organisation?.teamName ?? "Unknown organisation"}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <AdminPanel
          eyebrow="Case"
          title="Ticket context"
          description="Customer identity and case metadata only."
        >
          <div className="space-y-3">
            <Info label="Organisation" value={ticket.organisation?.teamName ?? "Unknown"} />
            <Info label="Created by" value={ticket.createdBy?.name ?? ticket.createdBy?.email ?? "Unknown"} />
            <Info label="Category" value={formatLabel(ticket.category)} />
            <Info label="Priority" value={formatLabel(ticket.priority)} />
            <Info label="Created" value={formatDateTime(ticket.createdAt)} />
            <Info label="Updated" value={formatDateTime(ticket.updatedAt)} />
          </div>
        </AdminPanel>

        <AdminPanel
          eyebrow="Ownership"
          title="Assignment"
          description="Assign the ticket to an active Waste X platform administrator."
        >
          <form
            action={assignSupportTicketAction.bind(null, ticket.id)}
            className="space-y-4"
          >
            <select
              name="assignedToUserId"
              defaultValue={ticket.assignedToUserId ?? ""}
              className="w-full rounded-2xl border border-black/15 bg-white px-4 py-3 text-sm font-semibold"
            >
              <option value="">Unassigned</option>
              {platformAdmins
                .filter((admin) => admin.isActive && !admin.isSuspended)
                .map((admin) => (
                  <option key={admin.id} value={admin.id}>
                    {admin.name} · {admin.email}
                  </option>
                ))}
            </select>
            <button className="rounded-full bg-black px-5 py-2.5 text-sm font-black text-white hover:bg-red-600">
              Save assignment
            </button>
          </form>
        </AdminPanel>

        <AdminPanel
          eyebrow="Workflow"
          title="Status"
          description="Status changes affect the support queue only; they do not mutate customer operational data."
        >
          <form
            action={setSupportTicketStatusAction.bind(null, ticket.id)}
            className="space-y-4"
          >
            <select
              name="status"
              defaultValue={ticket.status}
              className="w-full rounded-2xl border border-black/15 bg-white px-4 py-3 text-sm font-semibold"
            >
              <option value="open">Open</option>
              <option value="in_progress">In progress</option>
              <option value="waiting_on_user">Waiting on user</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
            <button className="rounded-full bg-black px-5 py-2.5 text-sm font-black text-white hover:bg-red-600">
              Update status
            </button>
          </form>
        </AdminPanel>
      </section>

      <AdminPanel
        eyebrow="Conversation"
        title="Customer-visible thread"
        description="Public replies are stored with isInternalNote=false and are visible through the existing customer support surfaces."
      >
        {publicMessages.length === 0 ? (
          <Empty>No public messages are recorded on this ticket.</Empty>
        ) : (
          <div className="space-y-3">
            {publicMessages.map((message) => {
              const supportAuthor = message.senderRole === "platform_admin";
              return (
                <article
                  key={message.id}
                  className={`rounded-2xl border p-4 ${
                    supportAuthor
                      ? "border-red-200 bg-red-50/40"
                      : "border-black/10 bg-white"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <AdminStatusPill
                        label={supportAuthor ? "Waste X Support" : "Customer"}
                        tone={supportAuthor ? "danger" : "dark"}
                      />
                      <span className="text-xs font-black text-black/55">
                        {message.senderName ?? message.senderEmail ?? "Unknown user"}
                      </span>
                    </div>
                    <span className="text-xs text-black/35">
                      {formatDateTime(message.createdAt)}
                    </span>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-black/65">
                    {message.message}
                  </p>
                </article>
              );
            })}
          </div>
        )}

        <div className="mt-6 border-t border-black/10 pt-6">
          {closed ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
              Reopen this ticket before sending another customer-visible reply.
              Internal notes can still be added below.
            </div>
          ) : (
            <form
              action={replySupportTicketAction.bind(null, ticket.id)}
              className="space-y-3"
            >
              <textarea
                name="message"
                required
                minLength={1}
                maxLength={5000}
                rows={5}
                placeholder="Reply to the customer..."
                className="w-full rounded-2xl border border-black/15 px-4 py-3 text-sm leading-6 outline-none focus:border-red-500"
              />
              <button className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-black text-white hover:bg-red-700">
                Send public reply
              </button>
            </form>
          )}
        </div>
      </AdminPanel>

      <AdminPanel
        eyebrow="Platform-only"
        title="Internal notes"
        description="These notes are stored with isInternalNote=true. The existing Desktop customer endpoint filters them out, so they remain inside Platform Admin."
      >
        {internalNotes.length === 0 ? (
          <Empty>No internal notes have been added yet.</Empty>
        ) : (
          <div className="space-y-3">
            {internalNotes.map((message) => (
              <article
                key={message.id}
                className="rounded-2xl border border-amber-200 bg-amber-50 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <AdminStatusPill label="Internal note" tone="warning" />
                  <span className="text-xs text-amber-900/50">
                    {message.senderName ?? message.senderEmail ?? "Platform admin"} ·{" "}
                    {formatDateTime(message.createdAt)}
                  </span>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-amber-950/75">
                  {message.message}
                </p>
              </article>
            ))}
          </div>
        )}

        <form
          action={addInternalSupportNoteAction.bind(null, ticket.id)}
          className="mt-6 space-y-3 border-t border-black/10 pt-6"
        >
          <textarea
            name="message"
            required
            minLength={1}
            maxLength={5000}
            rows={4}
            placeholder="Add a platform-only investigation note..."
            className="w-full rounded-2xl border border-amber-300 bg-amber-50/50 px-4 py-3 text-sm leading-6 outline-none focus:border-amber-500"
          />
          <button className="rounded-full bg-amber-900 px-5 py-2.5 text-sm font-black text-white hover:bg-black">
            Add internal note
          </button>
        </form>
      </AdminPanel>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-black/10 px-4 py-3">
      <span className="text-xs font-black uppercase tracking-[0.14em] text-black/35">
        {label}
      </span>
      <span className="max-w-[65%] break-words text-right text-sm font-black text-black">
        {value}
      </span>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-black/15 p-5 text-sm font-semibold text-black/40">
      {children}
    </div>
  );
}

function formatLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatCompact(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
  }).format(new Date(value));
}
