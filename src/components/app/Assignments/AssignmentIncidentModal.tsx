"use client";

import { useState } from "react";
import { useAction } from "@/lib/actions/useAction";
import { createIncidentAction } from "@/modules/incidents/actions/createIncidentAction";
import { useRouter } from "next/navigation";

export default function AssignmentIncidentModal({
  assignment,
  hasIncident = false,
}: {
  assignment: {
    assignmentId: string;
    listingId: number;
    listingName: string;
    assignedAt: Date | null;
  };
  hasIncident?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const run = useAction();
  const router = useRouter();

  async function handleSubmit(formData: FormData) {
    if (loading || hasIncident) return;

    setLoading(true);
    setMessage(null);

    try {
      const result = await run(() =>
        createIncidentAction({
          assignmentId: assignment.assignmentId,
          type: formData.get("type") as string,
          summary: formData.get("summary") as string,
          incidentDate: formData.get("incidentDate") as string,
          incidentLocation: formData.get("incidentLocation") as string,
          immediateAction: formData.get("immediateAction") as string,
          responsiblePerson: formData.get("responsiblePerson") as string,
        }),
      );

      if (!result?.success) {
        throw new Error(result?.message || "Failed to report incident");
      }

      setMessage({
        type: "success",
        text: result.message || "Incident submitted successfully.",
      });

      setTimeout(() => {
        setOpen(false);
        router.refresh();
      }, 900);
    } catch (err: any) {
      console.error(err);

      setMessage({
        type: "error",
        text: err.message || "Failed to report incident.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (!hasIncident) setOpen(true);
        }}
        disabled={hasIncident}
        className={`w-full rounded-2xl px-4 py-3 text-sm font-semibold transition ${
          hasIncident
            ? "cursor-not-allowed bg-black/10 text-black/35"
            : "bg-orange-600 text-white hover:bg-orange-500"
        }`}
      >
        {hasIncident ? "Incident Already Reported" : "Report Incident"}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4 py-8 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          {/* BACKDROP CLICK AREA */}
          <button
            type="button"
            aria-label="Close incident modal"
            onClick={() => {
              if (!loading) setOpen(false);
            }}
            className="absolute inset-0 cursor-default"
          />

          {/* MODAL CARD */}
          <div className="relative z-10 flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-black/10 bg-white shadow-2xl">
            {/* HEADER */}
            <div className="shrink-0 border-b border-black/10 bg-black p-6 text-white">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-orange-400">
                    Waste X Incident
                  </p>

                  <h2 className="mt-2 text-xl font-semibold">
                    Report Incident
                  </h2>

                  <p className="mt-2 max-w-xl text-sm leading-6 text-white/55">
                    Log an operational issue against this assignment. This will
                    become part of the compliance record.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (!loading) setOpen(false);
                  }}
                  disabled={loading}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/70 transition hover:border-orange-400/40 hover:text-orange-300 disabled:opacity-50"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* SCROLLABLE BODY */}
            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              {message && (
                <div
                  className={`mb-5 rounded-2xl border p-4 text-sm ${
                    message.type === "success"
                      ? "border-green-200 bg-green-50 text-green-700"
                      : "border-red-200 bg-red-50 text-red-700"
                  }`}
                >
                  {message.text}
                </div>
              )}

              <div className="mb-6 rounded-2xl border border-black/10 bg-[#f7f3ed] p-4 text-sm">
                <p className="font-semibold text-black">
                  {assignment.listingName}
                </p>

                <p className="mt-1 text-xs text-black/45">
                  Assignment ID:{" "}
                  <span className="font-mono">
                    {assignment.assignmentId.slice(0, 8)}
                  </span>
                </p>
              </div>

              <form action={handleSubmit} className="space-y-5">
                {/* INCIDENT TYPE */}
                <div>
                  <label className="text-sm font-medium text-black">
                    Incident Type <span className="text-orange-600">*</span>
                  </label>

                  <select
                    name="type"
                    required
                    disabled={loading}
                    className="mt-2 w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm text-black outline-none transition focus:border-orange-500 focus:bg-white disabled:opacity-60"
                  >
                    <option value="">Select incident type</option>
                    <option value="contaminated_waste">
                      Contaminated Waste
                    </option>
                    <option value="access_issue">Access Issue</option>
                    <option value="quantity_mismatch">Quantity Mismatch</option>
                    <option value="damaged_load">Damaged Load</option>
                    <option value="missed_collection">Missed Collection</option>
                    <option value="health_and_safety">
                      Health & Safety Concern
                    </option>
                    <option value="other">Other</option>
                  </select>
                </div>

                {/* INCIDENT DATE */}
                <div>
                  <label className="text-sm font-medium text-black">
                    Incident Date
                  </label>

                  <input
                    type="datetime-local"
                    name="incidentDate"
                    disabled={loading}
                    className="mt-2 w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm text-black outline-none transition focus:border-orange-500 focus:bg-white disabled:opacity-60"
                  />
                </div>

                {/* LOCATION */}
                <div>
                  <label className="text-sm font-medium text-black">
                    Incident Location
                  </label>

                  <input
                    name="incidentLocation"
                    placeholder="Where did this happen?"
                    disabled={loading}
                    className="mt-2 w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm text-black outline-none transition placeholder:text-black/30 focus:border-orange-500 focus:bg-white disabled:opacity-60"
                  />
                </div>

                {/* SUMMARY */}
                <div>
                  <label className="text-sm font-medium text-black">
                    Summary <span className="text-orange-600">*</span>
                  </label>

                  <textarea
                    name="summary"
                    placeholder="Describe the incident..."
                    required
                    disabled={loading}
                    rows={4}
                    className="mt-2 w-full resize-none rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm text-black outline-none transition placeholder:text-black/30 focus:border-orange-500 focus:bg-white disabled:opacity-60"
                  />
                </div>

                {/* IMMEDIATE ACTION */}
                <div>
                  <label className="text-sm font-medium text-black">
                    Immediate Action
                  </label>

                  <textarea
                    name="immediateAction"
                    placeholder="What action was taken immediately?"
                    disabled={loading}
                    rows={3}
                    className="mt-2 w-full resize-none rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm text-black outline-none transition placeholder:text-black/30 focus:border-orange-500 focus:bg-white disabled:opacity-60"
                  />
                </div>

                {/* RESPONSIBLE PERSON */}
                <div>
                  <label className="text-sm font-medium text-black">
                    Responsible Person
                  </label>

                  <input
                    name="responsiblePerson"
                    placeholder="Name of responsible person, if known"
                    disabled={loading}
                    className="mt-2 w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm text-black outline-none transition placeholder:text-black/30 focus:border-orange-500 focus:bg-white disabled:opacity-60"
                  />
                </div>

                {/* STICKY FOOTER */}
                <div className="sticky bottom-0 -mx-6 -mb-6 mt-6 flex justify-end gap-3 border-t border-black/10 bg-white px-6 py-4">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    disabled={loading}
                    className="rounded-full border border-black/10 bg-white px-5 py-2.5 text-sm font-semibold text-black/55 transition hover:border-orange-300 hover:text-orange-600 disabled:opacity-50"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={loading}
                    className="rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-orange-400 transition hover:bg-orange-500 hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading ? "Submitting..." : "Submit Incident"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}