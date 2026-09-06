"use client";

import { useEffect, useState } from "react";

import { rejectReceivingSiteLoadAction } from "./site-rejection-actions";

const CATEGORIES = [
  ["WASTE_MISMATCH", "Waste does not match booking"],
  ["CONTAMINATION", "Contamination / unacceptable material"],
  ["PERMIT_OR_COMPLIANCE", "Permit / compliance issue"],
  ["UNSAFE_LOAD", "Unsafe load"],
  ["DOCUMENTATION", "Missing / incorrect paperwork"],
  ["SITE_CAPACITY", "Site cannot receive this load"],
  ["OTHER", "Other"],
] as const;

export default function RejectLoadModal({
  loadId,
  returnDate,
  jobNumber,
  loadNumber,
}: {
  loadId: string;
  returnDate: string;
  jobNumber: string;
  loadNumber: number;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
      >
        Reject load
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby={`reject-load-title-${loadId}`}
            className="w-full max-w-xl overflow-hidden rounded-[24px] border border-white/10 bg-white shadow-2xl"
          >
            <div className="bg-black px-6 py-5 text-white">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-red-400">
                    Receiving-site decision
                  </p>
                  <h2 id={`reject-load-title-${loadId}`} className="mt-2 text-xl font-semibold">
                    Reject {jobNumber} · Load {loadNumber}
                  </h2>
                  <p className="mt-2 text-xs leading-5 text-white/50">
                    This closes the receiving-site transaction as rejected. The Driver can see the rejection after sync, but cannot change it.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close rejection dialog"
                  className="flex size-9 shrink-0 items-center justify-center rounded-full border border-white/15 text-lg text-white/60 hover:bg-white/10 hover:text-white"
                >
                  ×
                </button>
              </div>
            </div>

            <form action={rejectReceivingSiteLoadAction} className="space-y-5 p-6">
              <input type="hidden" name="loadId" value={loadId} />
              <input type="hidden" name="returnDate" value={returnDate} />

              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/45">
                  Rejection category
                </span>
                <select
                  name="category"
                  required
                  defaultValue=""
                  className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-[#fbfaf7] px-3 text-sm text-black outline-none focus:border-red-400 focus:bg-white"
                >
                  <option value="" disabled>
                    Select a reason category
                  </option>
                  {CATEGORIES.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/45">
                  What was refused and why?
                </span>
                <textarea
                  name="reason"
                  minLength={3}
                  maxLength={2000}
                  required
                  rows={5}
                  placeholder="e.g. Load contains plasterboard mixed into the booked inert material and cannot be accepted under this booking."
                  className="mt-2 w-full resize-y rounded-xl border border-red-200 bg-red-50/30 px-3 py-3 text-sm leading-6 text-black outline-none placeholder:text-black/30 focus:border-red-400 focus:bg-white"
                />
              </label>

              <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs leading-5 text-red-800">
                Waste X records the category, detailed reason and rejection time against this load. A normal completed-load ticket will not be generated for a rejected load.
              </div>

              <div className="flex justify-end gap-2 border-t border-black/5 pt-4">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-xl border border-black/10 px-4 py-2.5 text-xs font-semibold text-black/55"
                >
                  Keep load open
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-red-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-red-700"
                >
                  Confirm rejection
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
