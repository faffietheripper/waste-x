import { auth } from "@/auth";
import { database } from "@/db/database";
import { supportTickets, users } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

/* =========================================================
   TYPES
========================================================= */

type TicketStatus =
  | "open"
  | "in_progress"
  | "waiting_on_user"
  | "resolved"
  | "closed";

type TicketPriority = "low" | "medium" | "high" | "urgent";

type TicketCategory =
  | "bug"
  | "billing"
  | "access"
  | "feature_request"
  | "compliance"
  | "other";

/* =========================================================
   FORMATTERS
========================================================= */

function formatDate(date: Date | string | null | undefined) {
  if (!date) return "Not yet";

  return new Date(date).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatLabel(value: string | null | undefined) {
  if (!value) return "Unknown";

  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getStatusClass(status: TicketStatus | string) {
  switch (status) {
    case "open":
      return "border-orange-300 bg-orange-100 text-orange-700";

    case "in_progress":
      return "border-blue-300 bg-blue-100 text-blue-700";

    case "waiting_on_user":
      return "border-purple-300 bg-purple-100 text-purple-700";

    case "resolved":
      return "border-green-300 bg-green-100 text-green-700";

    case "closed":
      return "border-black bg-black text-white";

    default:
      return "border-gray-300 bg-gray-100 text-gray-700";
  }
}

function getPriorityClass(priority: TicketPriority | string) {
  switch (priority) {
    case "urgent":
      return "border-red-300 bg-red-100 text-red-700";

    case "high":
      return "border-orange-300 bg-orange-100 text-orange-700";

    case "medium":
      return "border-yellow-300 bg-yellow-100 text-yellow-700";

    case "low":
      return "border-green-300 bg-green-100 text-green-700";

    default:
      return "border-gray-300 bg-gray-100 text-gray-700";
  }
}

function getCategoryDescription(category: TicketCategory | string) {
  switch (category) {
    case "bug":
      return "Technical issue or unexpected platform behaviour.";

    case "billing":
      return "Subscription, invoice or payment support.";

    case "access":
      return "Login, permissions, organisation or user access issue.";

    case "feature_request":
      return "Suggested improvement or requested platform capability.";

    case "compliance":
      return "Audit, incident, waste tracking or compliance support.";

    case "other":
      return "General support request.";

    default:
      return "Support request.";
  }
}

/* =========================================================
   PAGE
========================================================= */

export default async function SupportPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const dbUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });

  if (!dbUser?.organisationId) {
    return (
      <main className="min-h-screen bg-[#f7f3ed] pl-[24vw] px-10 py-32">
        <section className="rounded-3xl border border-orange-200 bg-orange-50 p-8 text-orange-800 shadow-sm">
          <p className="font-semibold">No organisation found.</p>
          <p className="mt-2 text-sm leading-6">
            You need to belong to an organisation before creating or viewing
            support tickets.
          </p>

          <Link
            href="/home/settings/organisation?reason=no-organisation"
            className="mt-5 inline-flex rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
          >
            Create Organisation →
          </Link>
        </section>
      </main>
    );
  }

  const tickets = await database.query.supportTickets.findMany({
    where: eq(supportTickets.organisationId, dbUser.organisationId),
    orderBy: desc(supportTickets.createdAt),
  });

  /* =========================================================
     METRICS
  ========================================================= */

  const total = tickets.length;

  const open = tickets.filter((ticket) => ticket.status === "open").length;

  const inProgress = tickets.filter(
    (ticket) => ticket.status === "in_progress",
  ).length;

  const waitingOnUser = tickets.filter(
    (ticket) => ticket.status === "waiting_on_user",
  ).length;

  const resolved = tickets.filter(
    (ticket) => ticket.status === "resolved",
  ).length;

  const urgent = tickets.filter(
    (ticket) => ticket.priority === "urgent",
  ).length;

  const activeTickets = tickets.filter((ticket) =>
    ["open", "in_progress", "waiting_on_user"].includes(ticket.status),
  );

  const closedTickets = tickets.filter((ticket) =>
    ["resolved", "closed"].includes(ticket.status),
  );

  /* =========================================================
     UI
  ========================================================= */

  return (
    <main className="min-h-screen bg-[#f7f3ed] pl-[24vw] px-10 py-32">
      <div className="space-y-8">
        {/* HEADER */}
        <section className="rounded-3xl border border-black/10 bg-black p-8 text-white shadow-sm">
          <div className="flex items-start justify-between gap-8">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-orange-400">
                Waste X Support
              </p>

              <h1 className="mt-3 text-3xl font-semibold">Support Tickets</h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
                Raise and track support requests for technical issues, access
                problems, billing, compliance questions and operational workflow
                support.
              </p>
            </div>

            <Link
              href="/home/support/new"
              className="rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
            >
              + New Ticket
            </Link>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-white/70">
              Organisation ID: {dbUser.organisationId}
            </span>

            {waitingOnUser > 0 && (
              <span className="rounded-full border border-orange-400/30 bg-orange-500/10 px-4 py-2 text-xs font-medium text-orange-300">
                {waitingOnUser} waiting on you
              </span>
            )}
          </div>
        </section>

        {/* METRICS */}
        <section className="grid grid-cols-1 gap-5 md:grid-cols-3 xl:grid-cols-6">
          <MetricCard label="Total" value={total} />
          <MetricCard label="Open" value={open} danger={open > 0} />
          <MetricCard label="In Progress" value={inProgress} />
          <MetricCard
            label="Waiting On You"
            value={waitingOnUser}
            danger={waitingOnUser > 0}
          />
          <MetricCard label="Resolved" value={resolved} />
          <MetricCard label="Urgent" value={urgent} danger={urgent > 0} />
        </section>

        {/* GUIDANCE */}
        <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <GuidanceCard
            title="Operational support"
            text="Use support tickets for workflow issues around listings, assignments, bids, incidents and verification."
          />

          <GuidanceCard
            title="Access issues"
            text="Raise an access ticket if team members cannot see the correct department, organisation or assignment records."
          />

          <GuidanceCard
            title="Compliance questions"
            text="Use compliance support for audit exports, incident handling, chain-of-custody records or report questions."
          />
        </section>

        {/* ACTIVE TICKETS */}
        <section className="space-y-5">
          <div className="flex items-end justify-between gap-6">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
                Active Requests
              </p>

              <h2 className="mt-2 text-2xl font-semibold text-black">
                Open Support Tickets
              </h2>

              <p className="mt-2 text-sm text-black/45">
                Tickets that are open, in progress or waiting on your
                organisation.
              </p>
            </div>

            <span className="rounded-full bg-black px-4 py-2 text-xs font-medium text-orange-400">
              {activeTickets.length} active
            </span>
          </div>

          {activeTickets.length === 0 ? (
            <EmptyState
              title="No active support tickets"
              text="There are no open support requests for your organisation right now."
            />
          ) : (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              {activeTickets.map((ticket) => (
                <TicketCard key={ticket.id} ticket={ticket} />
              ))}
            </div>
          )}
        </section>

        {/* CLOSED TICKETS */}
        <section className="space-y-5">
          <div className="flex items-end justify-between gap-6">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-black/35">
                Closed Records
              </p>

              <h2 className="mt-2 text-2xl font-semibold text-black">
                Resolved & Closed Tickets
              </h2>

              <p className="mt-2 text-sm text-black/45">
                Previous support requests retained for organisation history.
              </p>
            </div>

            <span className="rounded-full bg-white px-4 py-2 text-xs font-medium text-black/45 ring-1 ring-black/10">
              {closedTickets.length} closed
            </span>
          </div>

          {closedTickets.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-black/20 bg-white p-8 text-sm text-black/45 shadow-sm">
              No resolved or closed tickets yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 opacity-80 xl:grid-cols-3">
              {closedTickets.map((ticket) => (
                <TicketCard key={ticket.id} ticket={ticket} compact />
              ))}
            </div>
          )}
        </section>

        {/* FULL TABLE */}
        <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-start justify-between gap-6">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
                Ticket Register
              </p>

              <h2 className="mt-2 text-xl font-semibold text-black">
                All Support Tickets
              </h2>

              <p className="mt-2 text-sm leading-6 text-black/45">
                Full support ticket register for your organisation.
              </p>
            </div>

            <span className="rounded-full bg-black px-4 py-2 text-xs font-medium text-orange-400">
              {tickets.length} records
            </span>
          </div>

          {tickets.length === 0 ? (
            <EmptyState
              title="No support tickets found"
              text="Create your first ticket if your organisation needs support."
            />
          ) : (
            <div className="divide-y divide-black/5">
              {tickets.map((ticket) => (
                <TicketRow key={ticket.id} ticket={ticket} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

/* =========================================================
   TICKET CARD
========================================================= */

function TicketCard({
  ticket,
  compact = false,
}: {
  ticket: any;
  compact?: boolean;
}) {
  return (
    <Link
      href={`/home/support/${ticket.id}`}
      className="block rounded-3xl border border-black/10 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-5">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-orange-600">
            Support Ticket
          </p>

          <h3 className="mt-3 text-lg font-semibold text-black">
            {formatLabel(ticket.category)}
          </h3>

          <p className="mt-2 text-sm leading-6 text-black/45">
            {getCategoryDescription(ticket.category)}
          </p>
        </div>

        <span
          className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${getStatusClass(
            ticket.status,
          )}`}
        >
          {formatLabel(ticket.status)}
        </span>
      </div>

      {!compact && (
        <div className="mt-5 grid grid-cols-2 gap-3">
          <MiniStat
            label="Priority"
            value={formatLabel(ticket.priority)}
            badgeClass={getPriorityClass(ticket.priority)}
          />

          <MiniStat label="Created" value={formatDate(ticket.createdAt)} />

          <MiniStat label="Updated" value={formatDate(ticket.updatedAt)} />

          <MiniStat
            label="Assigned"
            value={ticket.assignedToUserId ? "Assigned" : "Unassigned"}
          />
        </div>
      )}

      <div className="mt-6 flex items-center justify-between gap-4 border-t border-black/5 pt-5">
        <span className="text-xs text-black/35">
          ID: <span className="font-mono">{ticket.id.slice(0, 10)}...</span>
        </span>

        <span className="text-sm font-semibold text-orange-600">
          View Ticket →
        </span>
      </div>
    </Link>
  );
}

/* =========================================================
   TICKET ROW
========================================================= */

function TicketRow({ ticket }: { ticket: any }) {
  return (
    <Link
      href={`/home/support/${ticket.id}`}
      className="grid grid-cols-12 items-center gap-4 py-5 transition hover:bg-[#fbfaf7]"
    >
      <div className="col-span-3">
        <p className="font-medium text-black">{formatLabel(ticket.category)}</p>
        <p className="mt-1 text-xs text-black/40">
          {ticket.id.slice(0, 12)}...
        </p>
      </div>

      <div className="col-span-2">
        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${getPriorityClass(
            ticket.priority,
          )}`}
        >
          {formatLabel(ticket.priority)}
        </span>
      </div>

      <div className="col-span-2">
        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${getStatusClass(
            ticket.status,
          )}`}
        >
          {formatLabel(ticket.status)}
        </span>
      </div>

      <div className="col-span-2 text-sm text-black/45">
        {formatDate(ticket.createdAt)}
      </div>

      <div className="col-span-2 text-sm text-black/45">
        {formatDate(ticket.updatedAt)}
      </div>

      <div className="col-span-1 text-right text-sm font-medium text-orange-600">
        View →
      </div>
    </Link>
  );
}

/* =========================================================
   SMALL COMPONENTS
========================================================= */

function MetricCard({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-3xl border p-5 shadow-sm ${
        danger ? "border-orange-200 bg-orange-50" : "border-black/10 bg-white"
      }`}
    >
      <p
        className={`text-xs uppercase tracking-widest ${
          danger ? "text-orange-700" : "text-black/40"
        }`}
      >
        {label}
      </p>

      <p
        className={`mt-3 text-3xl font-semibold ${
          danger ? "text-orange-700" : "text-black"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function GuidanceCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
      <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
        Support Area
      </p>

      <h3 className="mt-3 text-base font-semibold text-black">{title}</h3>

      <p className="mt-2 text-sm leading-6 text-black/50">{text}</p>
    </div>
  );
}

function MiniStat({
  label,
  value,
  badgeClass,
}: {
  label: string;
  value: string;
  badgeClass?: string;
}) {
  return (
    <div className="rounded-2xl border border-black/10 bg-[#fbfaf7] p-4">
      <p className="text-[10px] uppercase tracking-widest text-black/35">
        {label}
      </p>

      {badgeClass ? (
        <span
          className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${badgeClass}`}
        >
          {value}
        </span>
      ) : (
        <p className="mt-2 truncate text-sm font-semibold text-black">
          {value}
        </p>
      )}
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-black/20 bg-white p-10 text-center shadow-sm">
      <p className="text-base font-semibold text-black">{title}</p>

      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-black/45">
        {text}
      </p>
    </div>
  );
}
