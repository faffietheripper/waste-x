"use client";

import {
  useFormStatus,
} from "react-dom";

import {
  assignTicketAction,
  updateTicketStatusAction,
} from "@/modules/support/tickets/actions/adminTicketActions";

/* =========================================================
   TYPES
========================================================= */

type TicketStatus =
  | "open"
  | "in_progress"
  | "waiting_on_user"
  | "resolved"
  | "closed";

type AdminTicketControlsProps = {
  ticket: {
    id: string;
    status: TicketStatus;
    assignedToUserId?:
      | string
      | null;
  };
};

/* =========================================================
   MAIN COMPONENT
========================================================= */

export default function AdminTicketControls({
  ticket,
}: AdminTicketControlsProps) {
  return (
    <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
            Admin Controls
          </p>

          <h2 className="mt-2 text-xl font-semibold text-black">
            Manage ticket
          </h2>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-black/45">
            Update the ticket
            status or assign it
            to yourself for
            support handling.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <StatusUpdateForm
            ticketId={ticket.id}
            currentStatus={
              ticket.status
            }
          />

          <AssignmentForm
            ticketId={ticket.id}
            isAssigned={Boolean(
              ticket.assignedToUserId,
            )}
          />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 border-t border-black/5 pt-6 sm:grid-cols-2">
        <DetailCard
          label="Current Status"
          value={formatStatus(
            ticket.status,
          )}
        />

        <DetailCard
          label="Assigned"
          value={
            ticket.assignedToUserId
              ? "Assigned"
              : "Unassigned"
          }
        />
      </div>
    </div>
  );
}

/* =========================================================
   STATUS UPDATE FORM
========================================================= */

function StatusUpdateForm({
  ticketId,
  currentStatus,
}: {
  ticketId: string;
  currentStatus: TicketStatus;
}) {
  return (
    <form
      action={
        updateTicketStatusAction
      }
      className="flex flex-col gap-3 rounded-2xl border border-black/10 bg-[#fbfaf7] p-4 sm:flex-row sm:items-end"
    >
      <input
        type="hidden"
        name="ticketId"
        value={ticketId}
      />

      <div>
        <label
          htmlFor={`ticket-status-${ticketId}`}
          className="mb-2 block text-xs font-semibold uppercase tracking-widest text-black/35"
        >
          Status
        </label>

        <select
          id={`ticket-status-${ticketId}`}
          name="status"
          defaultValue={
            currentStatus
          }
          className="min-w-[190px] rounded-full border border-black/10 bg-white px-4 py-2.5 text-sm font-medium text-black outline-none transition focus:border-orange-300 focus:ring-4 focus:ring-orange-100"
        >
          <option value="open">
            Open
          </option>

          <option value="in_progress">
            In Progress
          </option>

          <option value="waiting_on_user">
            Waiting On User
          </option>

          <option value="resolved">
            Resolved
          </option>

          <option value="closed">
            Closed
          </option>
        </select>
      </div>

      <StatusSubmitButton />
    </form>
  );
}

/* =========================================================
   ASSIGNMENT FORM
========================================================= */

function AssignmentForm({
  ticketId,
  isAssigned,
}: {
  ticketId: string;
  isAssigned: boolean;
}) {
  return (
    <form
      action={
        assignTicketAction
      }
      className="rounded-2xl border border-black/10 bg-[#fbfaf7] p-4"
    >
      <input
        type="hidden"
        name="ticketId"
        value={ticketId}
      />

      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-black/35">
        Assignment
      </p>

      <AssignmentSubmitButton
        isAssigned={
          isAssigned
        }
      />
    </form>
  );
}

/* =========================================================
   SUBMIT BUTTONS
========================================================= */

function StatusSubmitButton() {
  const {
    pending,
  } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-orange-400 transition hover:bg-orange-500 hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
    >
      {pending
        ? "Updating..."
        : "Update Status"}
    </button>
  );
}

function AssignmentSubmitButton({
  isAssigned,
}: {
  isAssigned: boolean;
}) {
  const {
    pending,
  } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full border border-black/10 bg-white px-5 py-2.5 text-sm font-semibold text-black/60 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {pending
        ? "Assigning..."
        : isAssigned
          ? "Assign to Me"
          : "Assign to Me"}
    </button>
  );
}

/* =========================================================
   SMALL COMPONENTS
========================================================= */

function DetailCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-black/5 bg-[#fbfaf7] p-4">
      <p className="text-xs uppercase tracking-widest text-black/35">
        {label}
      </p>

      <p className="mt-2 text-sm font-semibold text-black/75">
        {value}
      </p>
    </div>
  );
}

/* =========================================================
   FORMATTERS
========================================================= */

function formatStatus(
  status: TicketStatus,
) {
  return status
    .split("_")
    .map(
      (part) =>
        part
          .charAt(0)
          .toUpperCase() +
        part.slice(1),
    )
    .join(" ");
}
