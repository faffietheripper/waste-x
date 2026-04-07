"use client";

import { useState } from "react";
import { createIncident } from "@/app/home/carrier-hub/waste-carriers/incidents-&-reports/actions";
import { useAction } from "@/lib/actions/useAction";

interface Assignment {
  assignmentId: string;
  listingId: number;
  listingName: string;
  assignedAt: Date | null;
}

export default function IncidentModal({
  assignments = [],
}: {
  assignments?: Assignment[];
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const run = useAction();

  async function handleSubmit(formData: FormData) {
    setLoading(true);

    const result = await run(() =>
      createIncident({
        assignmentId: formData.get("assignmentId") as string,
        type: formData.get("type") as string,
        summary: formData.get("summary") as string,
      }),
    );

    setLoading(false);

    /**
     * ✅ Clean handling model:
     * result === null → error (caught by useAction)
     * result !== null → success
     */
    if (result !== null) {
      setOpen(false);
    } else {
      console.error("Failed to create incident");
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="bg-black text-white px-4 py-2 rounded-xl"
      >
        + Report Incident
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
          <div className="bg-white w-full max-w-lg rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-semibold">Report New Incident</h2>

            <form action={handleSubmit} className="space-y-4">
              {/* ASSIGNMENT */}
              <select
                name="assignmentId"
                required
                className="w-full border rounded-lg p-2"
              >
                <option value="">Select Job</option>

                {assignments.map((assignment) => (
                  <option
                    key={assignment.assignmentId}
                    value={assignment.assignmentId}
                  >
                    {assignment.listingName}
                    {assignment.assignedAt &&
                      ` (Assigned ${new Date(
                        assignment.assignedAt,
                      ).toLocaleDateString()})`}
                  </option>
                ))}
              </select>

              {/* TYPE */}
              <select
                name="type"
                required
                className="w-full border rounded-lg p-2"
              >
                <option value="">Select incident type</option>
                <option value="contaminated_waste">Contaminated Waste</option>
                <option value="access_issue">Access Issue</option>
                <option value="quantity_mismatch">Quantity Mismatch</option>
                <option value="damaged_load">Damaged Load</option>
                <option value="other">Other</option>
              </select>

              {/* SUMMARY */}
              <textarea
                name="summary"
                placeholder="Describe the issue..."
                required
                className="w-full border rounded-lg p-2"
              />

              {/* ACTIONS */}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 border rounded-lg"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-black text-white rounded-lg disabled:opacity-50"
                >
                  {loading ? "Submitting..." : "Submit"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
