"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { acceptAssignmentAction } from "@/modules/assignments/actions/acceptAssignmentAction";
import { rejectAssignmentAction } from "@/modules/assignments/actions/rejectAssignmentAction";
import { cancelAssignmentAction } from "@/modules/assignments/actions/cancelAssignmentAction";
import { markCollectedAction } from "@/modules/assignments/actions/markCollectedAction";
import { completeAssignmentAction } from "@/modules/assignments/actions/completeAssignmentAction";

type DepartmentType = "generator" | "carrier" | "compliance";

type AssignmentStatus =
  | "pending"
  | "accepted"
  | "in_progress"
  | "completed"
  | "rejected"
  | "cancelled";

export default function AssignmentActions({
  assignmentId,
  status,
  departmentType,
}: {
  assignmentId: string;
  status: AssignmentStatus;
  departmentType: DepartmentType;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function runAction(action: () => Promise<any>) {
    if (loading) return;

    setLoading(true);

    try {
      const result = await action();

      if (!result?.success) {
        throw new Error(result?.message || "Action failed");
      }

      router.refresh();
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (departmentType === "compliance") {
    return (
      <div className="bg-white border rounded-2xl p-6 text-sm text-gray-500">
        Compliance view is read-only.
      </div>
    );
  }

  if (departmentType === "generator") {
    return (
      <div className="bg-white border rounded-2xl p-6 space-y-3">
        <h2 className="font-semibold">Generator Actions</h2>

        {status !== "completed" && status !== "cancelled" ? (
          <button
            disabled={loading}
            onClick={() =>
              runAction(() => cancelAssignmentAction({ assignmentId }))
            }
            className="w-full bg-red-600 text-white py-2 rounded disabled:opacity-50"
          >
            {loading ? "Working..." : "Cancel Assignment"}
          </button>
        ) : (
          <p className="text-sm text-gray-500">No actions available.</p>
        )}
      </div>
    );
  }

  if (departmentType === "carrier") {
    return (
      <div className="bg-white border rounded-2xl p-6 space-y-3">
        <h2 className="font-semibold">Carrier Actions</h2>

        {status === "pending" && (
          <>
            <button
              disabled={loading}
              onClick={() =>
                runAction(() => acceptAssignmentAction({ assignmentId }))
              }
              className="w-full bg-green-600 text-white py-2 rounded disabled:opacity-50"
            >
              {loading ? "Working..." : "Accept Assignment"}
            </button>

            <button
              disabled={loading}
              onClick={() =>
                runAction(() => rejectAssignmentAction({ assignmentId }))
              }
              className="w-full bg-red-600 text-white py-2 rounded disabled:opacity-50"
            >
              {loading ? "Working..." : "Reject Assignment"}
            </button>
          </>
        )}

        {status === "accepted" && (
          <button
            disabled={loading}
            onClick={() =>
              runAction(() =>
                markCollectedAction({
                  assignmentId,
                }),
              )
            }
            className="w-full bg-blue-600 text-white py-2 rounded disabled:opacity-50"
          >
            {loading ? "Working..." : "Mark Collected"}
          </button>
        )}

        {status === "in_progress" && (
          <button
            disabled={loading}
            onClick={() =>
              runAction(() => completeAssignmentAction({ assignmentId }))
            }
            className="w-full bg-black text-white py-2 rounded disabled:opacity-50"
          >
            {loading ? "Working..." : "Complete Assignment"}
          </button>
        )}

        {!["pending", "accepted", "in_progress"].includes(status) && (
          <p className="text-sm text-gray-500">No actions available.</p>
        )}
      </div>
    );
  }

  return null;
}
