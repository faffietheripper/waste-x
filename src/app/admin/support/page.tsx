// src/app/admin/support/page.tsx

import Link from "next/link";
import { desc } from "drizzle-orm";

import { database } from "@/db/database";
import { supportTickets } from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";

type TicketPriority = "low" | "medium" | "high" | "urgent";
type TicketStatus = "open" | "in_progress" | "waiting_on_user" | "resolved" | "closed";

export default async function AdminSupportDashboard() {
  await requirePlatformAdmin();

  const tickets = await database.query.supportTickets.findMany({
    with: {
      organisation: true,
      assignedTo: true,
      createdBy: true,
    },
    orderBy: [desc(supportTickets.updatedAt)],
  });

  const totalTickets = tickets.length;

  const openTickets = tickets.filter((ticket) => ticket.status === "open").length;

  const inProgressTickets = tickets.filter(
    (ticket) => ticket.status === "in_progress",
  ).length;

  const waitingOnUserTickets = tickets.filter(
    (ticket) => ticket.status === "waiting_on_user",
  ).length;

  const resolvedTickets = tickets.filter(
    (ticket) => ticket.status === "resolved" || ticket.status === "closed",
  ).length;

  const urgentTickets = tickets.filter(
    (ticket) => ticket.priority === "urgent",
  ).length;

  const highPriorityTickets = tickets.filter(
    (ticket) => ticket.priority === "high",
  ).length;

  const unassignedTickets = tickets.filter(
    (ticket) => !ticket.assignedToUserId,
  ).length;

  const activeTickets = tickets.filter(
    (ticket) => ticket.status !== "resolved" && ticket.status !== "closed",
  );

  const recentlyUpdatedTickets = tickets.slice(0, 8);

  return (
    <div className="space-y-8">
      {/* ================= HEADER ================= */}
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-7 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">
              Platform Helpdesk
            </p>

            <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-950">
              Support Management
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
              Manage customer support tickets, monitor urgent issues, review
              unassigned requests and track operational support across Waste X
              organisations.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/alerts"
              className="rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
            >
              Alerts
            </Link>

            <Link
              href="/admin/audit/live"
              className="rounded-full bg-gray-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800"
            >
              Live activity
            </Link>
          </div>
        </div>
      </section>

      {/* ================= KPI GRID ================= */}
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
        <Metric
          label="Total tickets"
          value={totalTickets}
          helper="All support tickets"
        />

        <Metric
          label="Open"
          value={openTickets}
          helper="Needs first response"
          tone={openTickets > 0 ? "danger" : "default"}
        />

        <Metric
          label="In progress"
          value={inProgressTickets}
          helper="Currently being handled"
        />

        <Metric
          label="Urgent / High"
          value={urgentTickets + highPriorityTickets}
          helper={`${urgentTickets} urgent, ${highPriorityTickets} high`}
          tone={urgentTickets + highPriorityTickets > 0 ? "danger" : "default"}
        />

        <Metric
          label="Unassigned"
          value={unassignedTickets}
          helper="No admin assigned"
          tone={unassignedTickets > 0 ? "danger" : "default"}
        />
      </section>

      {/* ================= SUPPORT HEALTH ================= */}
      <section className="grid gap-6 xl:grid-cols-3">
        <section className="rounded-[1.75rem] border border-gray-200 bg-white p-7 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
            Support Health
          </p>

          <div className="mt-5 flex items-end gap-3">
            <p
              className={`text-5xl font-black tracking-tight ${
                openTickets + urgentTickets + unassignedTickets > 0
                  ? "text-red-700"
                  : "text-gray-950"
              }`}
            >
              {openTickets + urgentTickets + unassignedTickets > 0
                ? "Review"
                : "Clear"}
            </p>
          </div>

          <p className="mt-4 text-sm leading-6 text-gray-500">
            Open, urgent and unassigned tickets should be reviewed first because
            they affect customer trust and platform reliability.
          </p>
        </section>

        <section className="grid gap-5 md:grid-cols-2 xl:col-span-2">
          <MiniMetric
            label="Active tickets"
            value={activeTickets.length}
            helper="Open, in progress or waiting"
          />

          <MiniMetric
            label="Waiting on user"
            value={waitingOnUserTickets}
            helper="Admin is waiting for customer response"
          />

          <MiniMetric
            label="Resolved / Closed"
            value={resolvedTickets}
            helper="Tickets no longer active"
          />

          <MiniMetric
            label="Resolution coverage"
            value={`${calculateRate(resolvedTickets, totalTickets)}%`}
            helper="Resolved or closed / total"
          />
        </section>
      </section>

      {/* ================= PRIORITY QUEUE ================= */}
      <section className="grid gap-6 xl:grid-cols-2">
        <Panel
          eyebrow="Priority Queue"
          title="Tickets needing attention"
          description="Urgent, high priority, open and unassigned tickets are shown first."
        >
          {activeTickets.length === 0 ? (
            <EmptyState message="No active support tickets." />
          ) : (
            <div className="space-y-3">
              {[...activeTickets]
                .sort((first, second) => {
                  const priorityDiff =
                    getPriorityRank(second.priority) -
                    getPriorityRank(first.priority);

                  if (priorityDiff !== 0) return priorityDiff;

                  const firstTime = first.updatedAt
                    ? new Date(first.updatedAt).getTime()
                    : 0;

                  const secondTime = second.updatedAt
                    ? new Date(second.updatedAt).getTime()
                    : 0;

                  return secondTime - firstTime;
                })
                .slice(0, 6)
                .map((ticket) => (
                  <TicketCard key={ticket.id} ticket={ticket} compact />
                ))}
            </div>
          )}
        </Panel>

        <Panel
          eyebrow="Recently Updated"
          title="Latest support activity"
          description="Most recently updated tickets across the platform."
        >
          {recentlyUpdatedTickets.length === 0 ? (
            <EmptyState message="No support tickets found." />
          ) : (
            <div className="space-y-3">
              {recentlyUpdatedTickets.map((ticket) => (
                <TicketCard key={ticket.id} ticket={ticket} compact />
              ))}
            </div>
          )}
        </Panel>
      </section>

      {/* ================= FULL TICKET REGISTER ================= */}
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-200 pb-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
              Ticket Register
            </p>

            <h2 className="mt-2 text-lg font-bold text-gray-950">
              All support tickets
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
              Review support status, priority, organisation, assigned admin and
              latest update time.
            </p>
          </div>

          <span className="rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700">
            {tickets.length} ticket{tickets.length === 1 ? "" : "s"}
          </span>
        </div>

        {tickets.length === 0 ? (
          <div className="mt-6">
            <EmptyState message="No support tickets have been created yet." />
          </div>
        ) : (
          <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200">
            <div className="overflow-x-auto">
              <table className="min-w-[1100px] w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <TableHead>Ticket</TableHead>
                    <TableHead>Organisation</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Assigned</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead>Action</TableHead>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-200 bg-white">
                  {tickets.map((ticket) => (
                    <tr key={ticket.id} className="transition hover:bg-gray-50">
                      <TableCell>
                        <div>
                          <Link
                            href={`/admin/support/${ticket.id}`}
                            className="font-semibold text-gray-950 underline-offset-4 hover:underline"
                          >
                            {formatLabel(ticket.category)} Ticket
                          </Link>

                          <p className="mt-1 max-w-[26rem] truncate text-xs text-gray-400">
                            {ticket.subject ?? `Ticket ${ticket.id}`}
                          </p>
                        </div>
                      </TableCell>

                      <TableCell>
                        {ticket.organisation?.teamName ?? "Unknown organisation"}
                      </TableCell>

                      <TableCell>
                        <PriorityBadge priority={ticket.priority} />
                      </TableCell>

                      <TableCell>
                        <StatusBadge status={ticket.status} />
                      </TableCell>

                      <TableCell>{ticket.assignedTo?.name ?? "Unassigned"}</TableCell>

                      <TableCell>{formatDateTime(ticket.updatedAt)}</TableCell>

                      <TableCell>
                        <Link
                          href={`/admin/support/${ticket.id}`}
                          className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-white"
                        >
                          Open
                        </Link>
                      </TableCell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
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
        className={`mt-3 text-3xl font-bold tracking-tight ${
          tone === "danger" ? "text-red-700" : "text-gray-950"
        }`}
      >
        {value}
      </p>

      <p className="mt-2 text-xs leading-5 text-gray-400">{helper}</p>
    </div>
  );
}

function MiniMetric({
  label,
  value,
  helper,
}: {
  label: string;
  value: string | number;
  helper: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{label}</p>

      <p className="mt-3 text-2xl font-bold tracking-tight text-gray-950">
        {value}
      </p>

      <p className="mt-2 text-xs leading-5 text-gray-400">{helper}</p>
    </div>
  );
}

function Panel({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
          {eyebrow}
        </p>

        <h2 className="mt-2 text-lg font-bold text-gray-950">{title}</h2>

        <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
          {description}
        </p>
      </div>

      {children}
    </section>
  );
}

function TicketCard({
  ticket,
  compact = false,
}: {
  ticket: any;
  compact?: boolean;
}) {
  return (
    <Link
      href={`/admin/support/${ticket.id}`}
      className="block rounded-[1.35rem] border border-gray-200 bg-gray-50 p-5 transition hover:border-gray-300 hover:bg-white"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <PriorityBadge priority={ticket.priority} />
            <StatusBadge status={ticket.status} />
          </div>

          <h3 className="mt-3 text-sm font-bold text-gray-950">
            {formatLabel(ticket.category)} Ticket
          </h3>

          {!compact && (
            <p className="mt-2 text-sm leading-6 text-gray-500">
              {ticket.subject ?? "No subject recorded"}
            </p>
          )}

          <p className="mt-2 text-xs leading-5 text-gray-500">
            {ticket.organisation?.teamName ?? "Unknown organisation"} • Assigned
            to {ticket.assignedTo?.name ?? "Unassigned"}
          </p>
        </div>

        <p className="text-xs text-gray-400">
          Updated {formatDateTime(ticket.updatedAt)}
        </p>
      </div>
    </Link>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-8">
      <p className="text-sm font-semibold text-gray-950">{message}</p>

      <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
        Support tickets will appear here when organisations contact Waste X
        support.
      </p>
    </div>
  );
}

function TableHead({ children }: { children: React.ReactNode }) {
  return (
    <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
      {children}
    </th>
  );
}

function TableCell({ children }: { children: React.ReactNode }) {
  return (
    <td className="whitespace-nowrap px-4 py-4 align-middle text-sm text-gray-600">
      {children}
    </td>
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

function calculateRate(value: number, total: number) {
  if (!total || total <= 0) return 0;
  return Math.round((value / total) * 100);
}

function getPriorityRank(priority: string) {
  const rank: Record<string, number> = {
    low: 1,
    medium: 2,
    high: 3,
    urgent: 4,
  };

  return rank[priority] ?? 0;
}

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