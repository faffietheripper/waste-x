"use client";

import { useState } from "react";
import {
  assignTicketAction,
  updateTicketStatusAction,
} from "@/app/admin/support/action";

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
    assignedToUserId?: string | null;
  };
};

export default function AdminTicketControls({
  ticket,
}: AdminTicketControlsProps) {
  const [status, setStatus] = useState<TicketStatus>(ticket.status);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);

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
            Update the ticket status or assign it to yourself for support
            handling.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* STATUS UPDATE */}
          <form
            action={updateTicketStatusAction}
            onSubmit={() => setIsUpdating(true)}
            className="flex flex-col gap-3 rounded-2xl border border-black/10 bg-[#fbfaf7] p-4 sm:flex-row sm:items-center"
          >
            <input type="hidden" name="ticketId" value={ticket.id} />

            <div>
              <label
                htmlFor="ticket-status"
                className="mb-2 block text-xs font-semibold uppercase tracking-widest text-black/35"
              >
                Status
              </label>

              <select
                id="ticket-status"
                name="status"
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as TicketStatus)
                }
                className="min-w-[190px] rounded-full border border-black/10 bg-white px-4 py-2.5 text-sm font-medium text-black outline-none transition focus:border-orange-300 focus:ring-4 focus:ring-orange-100"
              >
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="waiting_on_user">Waiting On User</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={isUpdating}
              className="rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-orange-400 transition hover:bg-orange-500 hover:text-black disabled:cursor-not-allowed disabled:opacity-40 sm:mt-6"
            >
              {isUpdating ? "Updating..." : "Update Status"}
            </button>
          </form>

          {/* ASSIGN */}
          <form
            action={assignTicketAction}
            onSubmit={() => setIsAssigning(true)}
            className="rounded-2xl border border-black/10 bg-[#fbfaf7] p-4"
          >
            <input type="hidden" name="ticketId" value={ticket.id} />

            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-black/35">
              Assignment
            </p>

            <button
              type="submit"
              disabled={isAssigning}
              className="rounded-full border border-black/10 bg-white px-5 py-2.5 text-sm font-semibold text-black/60 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isAssigning ? "Assigning..." : "Assign to Me"}
            </button>
          </form>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 border-t border-black/5 pt-6 sm:grid-cols-2">
        <DetailCard label="Current Status" value={formatStatus(status)} />
        <DetailCard
          label="Assigned"
          value={ticket.assignedToUserId ? "Assigned" : "Unassigned"}
        />
      </div>
    </div>
  );
}

/* =========================================================
   SMALL COMPONENTS
========================================================= */

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/5 bg-[#fbfaf7] p-4">
      <p className="text-xs uppercase tracking-widest text-black/35">
        {label}
      </p>

      <p className="mt-2 text-sm font-semibold text-black/75">{value}</p>
    </div>
  );
}

function formatStatus(status: string) {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}