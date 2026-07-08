import Link from "next/link";
import { auth } from "@/auth";
import { database } from "@/db/database";
import { supportTickets, supportTicketMessages, users } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import ReplyToTicketForm from "@/components/app/Support/ReplyToTicketForm";

/* =========================================================
   PAGE
========================================================= */

export default async function TicketThreadPage({
  params,
}: {
  params: { ticketId: string };
}) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const dbUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });

  if (!dbUser?.organisationId) {
    throw new Error("No organisation");
  }

  const ticket = await database.query.supportTickets.findFirst({
    where: eq(supportTickets.id, params.ticketId),
    with: {
      createdBy: true,
      assignedTo: true,
    },
  });

  if (!ticket) {
    return notFound();
  }

  if (ticket.organisationId !== dbUser.organisationId) {
    throw new Error("Access denied.");
  }

  const messages = await database.query.supportTicketMessages.findMany({
    where: eq(supportTicketMessages.ticketId, ticket.id),
    with: {
      sender: true,
    },
    orderBy: asc(supportTicketMessages.createdAt),
  });

  const isPlatformAdmin = dbUser.role === "platform_admin";

  const visibleMessages = messages.filter((message) => {
    if (message.isInternalNote && !isPlatformAdmin) return false;
    return true;
  });

  const createdLabel = formatDate(ticket.createdAt);
  const updatedLabel = formatDate(ticket.updatedAt);

  return (
    <main className="min-h-screen bg-[#f7f3ed] pl-[24vw] px-10 py-32">
      <div className="space-y-8">
        {/* HEADER */}
        <section className="overflow-hidden rounded-3xl border border-black/10 bg-black text-white shadow-sm">
          <div className="p-8">
            <div className="flex flex-col gap-8 xl:flex-row xl:items-start xl:justify-between">
              <div className="max-w-3xl">
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href="/home/support"
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white/60 transition hover:border-orange-400/40 hover:bg-orange-500/10 hover:text-orange-300"
                  >
                    ← Back to Support
                  </Link>

                  <span className="rounded-full border border-orange-400/30 bg-orange-500/10 px-4 py-2 text-xs font-semibold text-orange-300">
                    Ticket #{ticket.id.slice(0, 8)}
                  </span>
                </div>

                <p className="mt-6 text-xs uppercase tracking-[0.25em] text-orange-400">
                  Waste X Support Thread
                </p>

                <h1 className="mt-3 text-3xl font-semibold capitalize">
                  {formatCategory(ticket.category)} Ticket
                </h1>

                <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
                  Review the support conversation, track status updates and send
                  replies to the Waste X support team.
                </p>

                <div className="mt-6 flex flex-wrap gap-3">
                  <StatusBadge status={ticket.status} dark />
                  <PriorityBadge priority={ticket.priority} dark />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:w-[360px]">
                <HeaderStat label="Created" value={createdLabel} />
                <HeaderStat label="Last Updated" value={updatedLabel} />
                <HeaderStat
                  label="Messages"
                  value={String(visibleMessages.length)}
                />
                <HeaderStat
                  label="Assigned To"
                  value={ticket.assignedTo?.name ?? "Unassigned"}
                />
              </div>
            </div>
          </div>

          <div className="border-t border-white/10 bg-white/[0.03] px-8 py-4">
            <div className="flex flex-wrap items-center gap-3 text-xs text-white/45">
              <span>
                Created by{" "}
                <span className="font-semibold text-white/70">
                  {ticket.createdBy?.name ?? "Unknown user"}
                </span>
              </span>

              <span className="hidden h-1 w-1 rounded-full bg-white/25 sm:block" />

              <span className="capitalize">
                Category:{" "}
                <span className="font-semibold text-white/70">
                  {formatCategory(ticket.category)}
                </span>
              </span>

              <span className="hidden h-1 w-1 rounded-full bg-white/25 sm:block" />

              <span>
                Status:{" "}
                <span className="font-semibold text-white/70">
                  {formatStatus(ticket.status)}
                </span>
              </span>
            </div>
          </div>
        </section>

        {/* MAIN GRID */}
        <section className="grid grid-cols-1 gap-8 xl:grid-cols-12">
          {/* CONVERSATION */}
          <div className="xl:col-span-8">
            <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
              <div className="mb-6 flex flex-col gap-4 border-b border-black/5 pb-6 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
                    Conversation
                  </p>

                  <h2 className="mt-2 text-xl font-semibold text-black">
                    Support messages
                  </h2>

                  <p className="mt-2 text-sm leading-6 text-black/45">
                    All visible messages for this support ticket are shown below.
                  </p>
                </div>

                <span className="w-fit rounded-full bg-black px-4 py-2 text-xs font-medium text-orange-400">
                  {visibleMessages.length} messages
                </span>
              </div>

              <div className="max-h-[65vh] space-y-5 overflow-y-auto pr-2">
                {visibleMessages.length === 0 ? (
                  <EmptyState
                    title="No messages yet"
                    text="This support ticket does not have any visible messages yet."
                  />
                ) : (
                  visibleMessages.map((message) => {
                    const isOwn = message.senderUserId === dbUser.id;

                    return (
                      <MessageBubble
                        key={message.id}
                        message={message.message}
                        senderName={
                          message.isInternalNote
                            ? "Internal Note"
                            : message.sender?.name ?? "Unknown user"
                        }
                        createdAt={message.createdAt}
                        isOwn={isOwn}
                        isInternalNote={Boolean(message.isInternalNote)}
                      />
                    );
                  })
                )}
              </div>
            </div>

            {ticket.status !== "closed" && (
              <div className="mt-8 rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                <div className="mb-5">
                  <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
                    Reply
                  </p>

                  <h2 className="mt-2 text-xl font-semibold text-black">
                    Add a response
                  </h2>

                  <p className="mt-2 text-sm leading-6 text-black/45">
                    Send an update to the support thread. Platform admins can
                    also add internal notes.
                  </p>
                </div>

                <ReplyToTicketForm
                  ticketId={ticket.id}
                  isPlatformAdmin={isPlatformAdmin}
                />
              </div>
            )}

            {ticket.status === "closed" && (
              <div className="mt-8 rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                <p className="text-sm font-semibold text-black">
                  This ticket is closed.
                </p>
                <p className="mt-2 text-sm leading-6 text-black/45">
                  Replies are disabled because this support ticket has been
                  closed.
                </p>
              </div>
            )}
          </div>

          {/* SIDEBAR */}
          <aside className="space-y-6 xl:col-span-4">
            <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
              <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
                Ticket Details
              </p>

              <h2 className="mt-2 text-xl font-semibold text-black">
                Overview
              </h2>

              <div className="mt-6 space-y-4">
                <DetailRow label="Ticket ID" value={ticket.id} mono />
                <DetailRow label="Category" value={formatCategory(ticket.category)} />
                <DetailRow label="Status" value={formatStatus(ticket.status)} />
                <DetailRow label="Priority" value={formatStatus(ticket.priority)} />
                <DetailRow
                  label="Created By"
                  value={ticket.createdBy?.name ?? "Unknown user"}
                />
                <DetailRow
                  label="Assigned To"
                  value={ticket.assignedTo?.name ?? "Unassigned"}
                />
                <DetailRow label="Created" value={createdLabel} />
                <DetailRow label="Last Updated" value={updatedLabel} />
              </div>
            </div>

            <div className="rounded-3xl border border-black/10 bg-black p-6 text-white shadow-sm">
              <p className="text-xs uppercase tracking-[0.25em] text-orange-400">
                Support Guidance
              </p>

              <h3 className="mt-3 text-lg font-semibold">
                What to include in replies
              </h3>

              <div className="mt-5 space-y-3">
                <GuidanceItem text="Add screenshots, error messages or exact steps where possible." />
                <GuidanceItem text="Keep ticket updates tied to one issue so the support trail stays clean." />
                <GuidanceItem text="Mention affected listing, assignment or department if relevant." />
              </div>
            </div>

            <div className="rounded-3xl border border-orange-200 bg-orange-50 p-6 shadow-sm">
              <p className="text-xs uppercase tracking-[0.25em] text-orange-700">
                Current State
              </p>

              <h3 className="mt-3 text-lg font-semibold text-black">
                {formatStatus(ticket.status)}
              </h3>

              <p className="mt-2 text-sm leading-6 text-black/55">
                {getStatusExplanation(ticket.status)}
              </p>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}

/* =========================================================
   COMPONENTS
========================================================= */

function MessageBubble({
  message,
  senderName,
  createdAt,
  isOwn,
  isInternalNote,
}: {
  message: string;
  senderName: string;
  createdAt: Date | string | null;
  isOwn: boolean;
  isInternalNote: boolean;
}) {
  return (
    <div className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[82%] rounded-3xl border p-5 text-sm shadow-sm ${
          isInternalNote
            ? "border-yellow-300 bg-yellow-50 text-yellow-900"
            : isOwn
              ? "border-black bg-black text-white"
              : "border-black/10 bg-[#fbfaf7] text-black"
        }`}
      >
        <div
          className={`mb-2 flex flex-wrap items-center gap-2 text-xs ${
            isInternalNote
              ? "text-yellow-800/70"
              : isOwn
                ? "text-white/45"
                : "text-black/40"
          }`}
        >
          <span className="font-semibold">
            {isInternalNote ? "Internal Note" : senderName}
          </span>

          <span className="h-1 w-1 rounded-full bg-current opacity-40" />

          <span>{formatDate(createdAt)}</span>
        </div>

        <div className="whitespace-pre-wrap leading-6">{message}</div>
      </div>
    </div>
  );
}

function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-widest text-white/35">{label}</p>
      <p className="mt-2 truncate text-sm font-semibold text-white/80">
        {value}
      </p>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-black/5 bg-[#fbfaf7] p-4">
      <p className="text-xs uppercase tracking-widest text-black/35">
        {label}
      </p>
      <p
        className={`mt-2 break-words text-sm font-semibold text-black/75 ${
          mono ? "font-mono" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function GuidanceItem({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-sm leading-6 text-white/55">{text}</p>
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-black/20 bg-[#fbfaf7] p-10 text-center">
      <p className="text-sm font-semibold text-black">{title}</p>
      <p className="mt-2 text-sm leading-6 text-black/45">{text}</p>
    </div>
  );
}

/* =========================================================
   BADGES
========================================================= */

function StatusBadge({
  status,
  dark = false,
}: {
  status: string;
  dark?: boolean;
}) {
  const styles: Record<string, string> = dark
    ? {
        open: "border-green-400/30 bg-green-500/10 text-green-300",
        in_progress: "border-blue-400/30 bg-blue-500/10 text-blue-300",
        waiting_on_user:
          "border-yellow-400/30 bg-yellow-500/10 text-yellow-300",
        resolved: "border-purple-400/30 bg-purple-500/10 text-purple-300",
        closed: "border-white/10 bg-white/5 text-white/55",
      }
    : {
        open: "border-green-200 bg-green-50 text-green-700",
        in_progress: "border-blue-200 bg-blue-50 text-blue-700",
        waiting_on_user: "border-yellow-200 bg-yellow-50 text-yellow-700",
        resolved: "border-purple-200 bg-purple-50 text-purple-700",
        closed: "border-gray-200 bg-gray-100 text-gray-700",
      };

  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${
        styles[status] ??
        (dark
          ? "border-white/10 bg-white/5 text-white/55"
          : "border-gray-200 bg-gray-100 text-gray-700")
      }`}
    >
      {formatStatus(status)}
    </span>
  );
}

function PriorityBadge({
  priority,
  dark = false,
}: {
  priority: string;
  dark?: boolean;
}) {
  const styles: Record<string, string> = dark
    ? {
        low: "border-white/10 bg-white/5 text-white/55",
        medium: "border-blue-400/30 bg-blue-500/10 text-blue-300",
        high: "border-orange-400/30 bg-orange-500/10 text-orange-300",
        urgent: "border-red-400/30 bg-red-500/10 text-red-300",
      }
    : {
        low: "border-gray-200 bg-gray-100 text-gray-600",
        medium: "border-blue-200 bg-blue-50 text-blue-700",
        high: "border-orange-200 bg-orange-50 text-orange-700",
        urgent: "border-red-200 bg-red-50 text-red-700",
      };

  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${
        styles[priority] ??
        (dark
          ? "border-white/10 bg-white/5 text-white/55"
          : "border-gray-200 bg-gray-100 text-gray-700")
      }`}
    >
      {formatStatus(priority)}
    </span>
  );
}

/* =========================================================
   FORMATTERS
========================================================= */

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "Not available";

  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatStatus(value: string | null | undefined) {
  if (!value) return "Unknown";

  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatCategory(value: string | null | undefined) {
  return formatStatus(value);
}

function getStatusExplanation(status: string) {
  switch (status) {
    case "open":
      return "This ticket is open and waiting for review or response.";

    case "in_progress":
      return "This ticket is currently being reviewed by the support team.";

    case "waiting_on_user":
      return "Support is waiting for more information from your organisation.";

    case "resolved":
      return "This ticket has been resolved but remains visible for audit history.";

    case "closed":
      return "This ticket has been closed and no further replies can be added.";

    default:
      return "This ticket is being tracked in the Waste X support system.";
  }
}