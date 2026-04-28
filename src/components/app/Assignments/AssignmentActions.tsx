"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { acceptAssignmentAction } from "@/modules/assignments/actions/acceptAssignmentAction";
import { rejectAssignmentAction } from "@/modules/assignments/actions/rejectAssignmentAction";
import { cancelAssignmentAction } from "@/modules/assignments/actions/cancelAssignmentAction";
import { completeAssignmentAction } from "@/modules/assignments/actions/completeAssignmentAction";

type DepartmentType = "generator" | "carrier" | "compliance";

type AssignmentStatus =
  | "pending"
  | "accepted"
  | "in_progress"
  | "completed"
  | "rejected"
  | "cancelled";

type Message = {
  type: "success" | "error";
  text: string;
};

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
  const [message, setMessage] = useState<Message | null>(null);

  async function runAction(action: () => Promise<any>) {
    if (loading) return;

    setLoading(true);
    setMessage(null);

    try {
      const result = await action();

      if (!result?.success) {
        throw new Error(result?.message || "Action failed.");
      }

      setMessage({
        type: "success",
        text: result.message || "Action completed successfully.",
      });

      setTimeout(() => {
        router.refresh();
      }, 700);
    } catch (err: any) {
      console.error(err);

      setMessage({
        type: "error",
        text: err.message || "Something went wrong.",
      });
    } finally {
      setLoading(false);
    }
  }

  function MessageBox() {
    if (!message) return null;

    return (
      <div
        className={`rounded-lg border p-3 text-sm ${
          message.type === "success"
            ? "bg-green-50 border-green-200 text-green-700"
            : "bg-red-50 border-red-200 text-red-700"
        }`}
      >
        {message.text}
      </div>
    );
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

        <MessageBox />

        {status === "in_progress" && (
          <button
            disabled={loading}
            onClick={() =>
              runAction(() => completeAssignmentAction({ assignmentId }))
            }
            className="w-full bg-green-600 text-white py-2 rounded disabled:opacity-50"
          >
            {loading ? "Working..." : "Confirm Completion"}
          </button>
        )}

        {status !== "completed" && status !== "cancelled" && (
          <button
            disabled={loading}
            onClick={() =>
              runAction(() => cancelAssignmentAction({ assignmentId }))
            }
            className="w-full bg-red-600 text-white py-2 rounded disabled:opacity-50"
          >
            {loading ? "Working..." : "Cancel Assignment"}
          </button>
        )}

        {(status === "completed" || status === "cancelled") && (
          <p className="text-sm text-gray-500">No actions available.</p>
        )}
      </div>
    );
  }

  if (departmentType === "carrier") {
    return (
      <div className="bg-white border rounded-2xl p-6 space-y-3">
        <h2 className="font-semibold">Carrier Actions</h2>

        <MessageBox />

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
          <p className="text-sm text-gray-500">
            Use the verification panel to confirm collection.
          </p>
        )}

        {status === "in_progress" && (
          <p className="text-sm text-gray-500">
            Collection has been recorded. Waiting for generator completion.
          </p>
        )}

        {!["pending", "accepted", "in_progress"].includes(status) && (
          <p className="text-sm text-gray-500">No actions available.</p>
        )}
      </div>
    );
  }

  return null;
}
