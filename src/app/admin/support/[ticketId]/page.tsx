// src/app/admin/support/[ticketId]/page.tsx

import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { auth } from "@/auth";
import { database } from "@/db/database";
import {
  supportTicketMessages,
  supportTickets,
  users,
} from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";

import ReplyToTicketForm from "@/components/app/Support/ReplyToTicketForm";
import AdminTicketControls from "@/components/app/Support/AdminTicketControls";

type AdminTicketThreadParams =
  | {
      ticketId: string;
    }
  | Promise<{
      ticketId: string;
    }>;

export default async function AdminTicketThread({
  params,
}: {
  params: AdminTicketThreadParams;
}) {
  await requirePlatformAdmin();

  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const resolvedParams = await params;

  const dbUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });

  if (!dbUser || dbUser.role !== "platform_admin") {
    throw new Error("Access denied.");
  }

  const ticket = await database.query.supportTickets.findFirst({
    where: eq(supportTickets.id, resolvedParams.ticketId),
    with: {
      organisation: true,
      assignedTo: true,
      createdBy: true,
    },
  });

  if (!ticket) {
    notFound();
  }

  const messages = await database.query.supportTicketMessages.findMany({
    where: eq(supportTicketMessages.ticketId, ticket.id),
    with: {
      sender: true,
    },
    orderBy: [asc(supportTicketMessages.createdAt)],
  });

  const internalNotes = messages.filter((message) => message.isInternalNote);
  const publicMessages = messages.filter((message) => !message.isInternalNote);

  return (
    <div className="space-y-8">
      {/* ================= HEADER ================= */}
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-7 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">
              Support Thread
            </p>

            <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-950">
              {formatLabel(ticket.category)} Ticket
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
              {ticket.organisation?.teamName ?? "Unknown organisation"} ·
              Created by {ticket.createdBy?.name ?? "Unknown user"}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <PriorityBadge priority={ticket.priority} />
              <StatusBadge status={ticket.status} />

              <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-600">
                {messages.length} message{messages.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/support"
              className="rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
            >
              ← Support
            </Link>

            {ticket.organisationId && (
              <Link
                href={`/admin/organisations/${encodeURIComponent(
                  ticket.organisationId,
                )}`}
                className="rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
              >
                Organisation
              </Link>
            )}

            <Link
              href={`/admin/audit/entity?entityId=${encodeURIComponent(
                ticket.id,
              )}`}
              className="rounded-full bg-gray-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800"
            >
              Audit
            </Link>
          </div>
        </div>
      </section>

      {/* ================= SUMMARY ================= */}
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Status"
          value={formatLabel(ticket.status)}
          helper="Current ticket state"
          tone={
            ticket.status === "open" || ticket.status === "in_progress"
              ? "danger"
              : "default"
          }
        />

        <Metric
          label="Priority"
          value={formatLabel(ticket.priority)}
          helper="Support urgency"
          tone={
            ticket.priority === "urgent" || ticket.priority === "high"
              ? "danger"
              : "default"
          }
        />

        <Metric
          label="Messages"
          value={messages.length}
          helper={`${publicMessages.length} public, ${internalNotes.length} internal`}
        />

        <Metric
          label="Assigned to"
          value={ticket.assignedTo?.name ?? "Unassigned"}
          helper="Current support owner"
          tone={!ticket.assignedTo ? "danger" : "default"}
        />
      </section>

      {/* ================= CONTROLS ================= */}
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
            Admin Controls
          </p>

          <h2 className="mt-2 text-lg font-bold text-gray-950">
            Ticket management
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
            Assign, update status and manage the support lifecycle for this
            ticket.
          </p>
        </div>

        <AdminTicketControls ticket={ticket} />
      </section>

      {/* ================= THREAD + DETAILS ================= */}
      <section className="grid gap-6 xl:grid-cols-3">
        {/* MESSAGE THREAD */}
        <section className="rounded-[1.75rem] border border-gray-200 bg-white shadow-sm xl:col-span-2">
          <div className="border-b border-gray-200 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
              Conversation
            </p>

            <h2 className="mt-2 text-lg font-bold text-gray-950">
              Message thread
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
              Customer replies and internal admin notes linked to this support
              ticket.
            </p>
          </div>

          <div className="max-h-[42rem] overflow-y-auto bg-gray-50 p-6">
            {messages.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8">
                <p className="text-sm font-semibold text-gray-950">
                  No messages yet.
                </p>

                <p className="mt-2 text-sm leading-6 text-gray-500">
                  Messages will appear here once the customer or admin replies.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message) => {
                  const isOwn = message.senderUserId === dbUser.id;

                  return (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      isOwn={isOwn}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {ticket.status !== "closed" ? (
            <div className="border-t border-gray-200 bg-white p-6">
              <ReplyToTicketForm ticketId={ticket.id} isPlatformAdmin />
            </div>
          ) : (
            <div className="border-t border-gray-200 bg-gray-50 p-6">
              <p className="text-sm font-semibold text-gray-950">
                This ticket is closed.
              </p>

              <p className="mt-2 text-sm leading-6 text-gray-500">
                Replies are disabled because the support ticket has been closed.
              </p>
            </div>
          )}
        </section>

        {/* SIDE DETAILS */}
        <aside className="space-y-6">
          <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
              Ticket Details
            </p>

            <h2 className="mt-2 text-lg font-bold text-gray-950">
              Support context
            </h2>

            <div className="mt-5 space-y-3">
              <InfoRow
                label="Organisation"
                value={ticket.organisation?.teamName ?? "Unknown"}
              />

              <InfoRow
                label="Created by"
                value={ticket.createdBy?.name ?? "Unknown"}
              />

              <InfoRow
                label="Assigned to"
                value={ticket.assignedTo?.name ?? "Unassigned"}
              />

              <InfoRow label="Created" value={formatDateTime(ticket.createdAt)} />

              <InfoRow label="Updated" value={formatDateTime(ticket.updatedAt)} />

              <InfoRow label="Ticket ID" value={ticket.id} />
            </div>
          </section>

          <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
              Investigation
            </p>

            <h2 className="mt-2 text-lg font-bold text-gray-950">
              Related links
            </h2>

            <div className="mt-5 space-y-3">
              <Link
                href={`/admin/audit/entity?entityId=${encodeURIComponent(
                  ticket.id,
                )}`}
                className="block rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-white"
              >
                Open ticket audit →
              </Link>

              {ticket.organisationId && (
                <Link
                  href={`/admin/organisations/${encodeURIComponent(
                    ticket.organisationId,
                  )}`}
                  className="block rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-white"
                >
                  Open organisation →
                </Link>
              )}

              <Link
                href="/admin/alerts"
                className="block rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-white"
              >
                Open alerts →
              </Link>
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}

/* =========================================================
   COMPONENTS
========================================================= */

function Metric({
  label,
  value,
  helper,
  tone = "default",
}: {
  label: string;
  value: string | number;
  helper: string;
  tone?: "default" | "danger";
}) {
  return (
    <div className="rounded-[1.5rem] border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{label}</p>

      <p
        className={`mt-3 truncate text-2xl font-bold tracking-tight ${
          tone === "danger" ? "text-red-700" : "text-gray-950"
        }`}
      >
        {value}
      </p>

      <p className="mt-2 text-xs leading-5 text-gray-400">{helper}</p>
    </div>
  );
}

function MessageBubble({
  message,
  isOwn,
}: {
  message: any;
  isOwn: boolean;
}) {
  const isInternalNote = Boolean(message.isInternalNote);

  const className = isInternalNote
    ? "border-gray-300 bg-gray-100 text-gray-900"
    : isOwn
      ? "border-gray-900 bg-gray-950 text-white"
      : "border-gray-200 bg-white text-gray-900";

  return (
    <div className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-[1.35rem] border px-5 py-4 shadow-sm ${className}`}
      >
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] opacity-70">
          <span>
            {isInternalNote
              ? "Internal Note"
              : message.sender?.name ?? "Unknown sender"}
          </span>

          {isOwn && !isInternalNote && <span>Admin</span>}
        </div>

        <div className="whitespace-pre-wrap text-sm leading-6">
          {message.message}
        </div>

        <div className="mt-3 text-right text-[10px] opacity-60">
          {formatDateTime(message.createdAt)}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
      <p className="text-xs font-medium text-gray-400">{label}</p>

      <p className="mt-1 break-words text-sm font-semibold text-gray-950">
        {value}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const className =
    status === "open"
      ? "border-red-200 bg-red-50 text-red-700"
      : status === "in_progress"
        ? "border-gray-900 bg-gray-950 text-white"
        : status === "waiting_on_user"
          ? "border-gray-300 bg-gray-100 text-gray-800"
          : status === "resolved"
            ? "border-gray-200 bg-gray-50 text-gray-600"
            : status === "closed"
              ? "border-gray-200 bg-white text-gray-500"
              : "border-gray-200 bg-white text-gray-600";

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${className}`}
    >
      {formatLabel(status)}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const className =
    priority === "urgent"
      ? "border-red-200 bg-red-50 text-red-700"
      : priority === "high"
        ? "border-red-200 bg-white text-red-700"
        : priority === "medium"
          ? "border-gray-300 bg-gray-100 text-gray-800"
          : "border-gray-200 bg-white text-gray-600";

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${className}`}
    >
      {formatLabel(priority)}
    </span>
  );
}

/* =========================================================
   HELPERS
========================================================= */

function formatLabel(value: string | null | undefined) {
  if (!value) return "Unknown";

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