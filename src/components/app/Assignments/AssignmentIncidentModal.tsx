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
        onClick={() => {
          if (!hasIncident) setOpen(true);
        }}
        disabled={hasIncident}
        className={`w-full px-4 py-2 rounded-xl ${
          hasIncident
            ? "bg-gray-300 text-gray-600 cursor-not-allowed"
            : "bg-orange-600 text-white"
        }`}
      >
        {hasIncident ? "Incident Already Reported" : "Report Incident"}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4">
          <div className="bg-white w-full max-w-xl rounded-2xl p-6 space-y-5">
            <div>
              <h2 className="text-lg font-semibold">Report Incident</h2>
              <p className="text-sm text-gray-500">
                Log an operational issue against this assignment.
              </p>
            </div>

            {message && (
              <div
                className={`rounded-lg p-3 text-sm ${
                  message.type === "success"
                    ? "bg-green-50 text-green-700 border border-green-200"
                    : "bg-red-50 text-red-700 border border-red-200"
                }`}
              >
                {message.text}
              </div>
            )}

            <div className="rounded-lg border p-3 text-sm bg-gray-50">
              <p className="font-medium">{assignment.listingName}</p>
              <p className="text-gray-500">
                Assignment ID: {assignment.assignmentId.slice(0, 8)}
              </p>
            </div>

            <form action={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium">Incident Type</label>
                <select
                  name="type"
                  required
                  className="mt-1 w-full border rounded-lg p-2"
                >
                  <option value="">Select incident type</option>
                  <option value="contaminated_waste">Contaminated Waste</option>
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

              <div>
                <label className="text-sm font-medium">Incident Date</label>
                <input
                  type="datetime-local"
                  name="incidentDate"
                  className="mt-1 w-full border rounded-lg p-2"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Incident Location</label>
                <input
                  name="incidentLocation"
                  placeholder="Where did this happen?"
                  className="mt-1 w-full border rounded-lg p-2"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Summary</label>
                <textarea
                  name="summary"
                  placeholder="Describe the incident..."
                  required
                  className="mt-1 w-full border rounded-lg p-2 min-h-28"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Immediate Action</label>
                <textarea
                  name="immediateAction"
                  placeholder="What action was taken immediately?"
                  className="mt-1 w-full border rounded-lg p-2 min-h-20"
                />
              </div>

              <div>
                <label className="text-sm font-medium">
                  Responsible Person
                </label>
                <input
                  name="responsiblePerson"
                  placeholder="Name of responsible person, if known"
                  className="mt-1 w-full border rounded-lg p-2"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={loading}
                  className="px-4 py-2 border rounded-lg disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-black text-white rounded-lg disabled:opacity-50"
                >
                  {loading ? "Submitting..." : "Submit Incident"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
