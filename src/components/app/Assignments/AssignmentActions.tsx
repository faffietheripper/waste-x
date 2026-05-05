"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { acceptAssignmentAction } from "@/modules/assignments/actions/acceptAssignmentAction";
import { rejectAssignmentAction } from "@/modules/assignments/actions/rejectAssignmentAction";
import { cancelAssignmentAction } from "@/modules/assignments/actions/cancelAssignmentAction";
import { completeAssignmentAction } from "@/modules/assignments/actions/completeAssignmentAction";

/* =========================================================
   TYPES
========================================================= */

type DepartmentType = "generator" | "carrier" | "manager" | "compliance";

type AssignmentStatus =
  | "pending"
  | "accepted"
  | "in_progress"
  | "completed"
  | "rejected"
  | "cancelled";

type AssignmentPerspective = "generator" | "manager" | "carrier" | "compliance";

type Message = {
  type: "success" | "error";
  text: string;
};

/* =========================================================
   COMPONENT
========================================================= */

export default function AssignmentActions({
  assignmentId,
  status,
  departmentType,
  perspective,
  variant = "panel",

  managerAcceptedAt = null,
  carrierOrganisationId = null,
  viewerOrganisationId,
}: {
  assignmentId: string;
  status: AssignmentStatus;
  departmentType: DepartmentType;
  perspective?: AssignmentPerspective;
  variant?: "panel" | "inline";

  managerAcceptedAt?: Date | string | null;
  carrierOrganisationId?: string | null;
  viewerOrganisationId?: string;
}) {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const isInline = variant === "inline";

  const effectivePerspective =
    perspective ??
    (departmentType === "compliance" ? "compliance" : departmentType);

  /*
    New workflow logic:

    Manager response:
      status = pending
      managerAcceptedAt = null
      carrierOrganisationId = null

    Manager accepted, now needs to assign carrier:
      status = pending
      managerAcceptedAt exists
      carrierOrganisationId = null

    Carrier response:
      status = pending
      managerAcceptedAt exists
      carrierOrganisationId = viewer org

    Carrier accepted:
      status = accepted

    Collection underway:
      status = in_progress
  */

  const managerHasAccepted = Boolean(managerAcceptedAt);
  const carrierHasBeenAssigned = Boolean(carrierOrganisationId);

  const managerNeedsToRespond =
    effectivePerspective === "manager" &&
    status === "pending" &&
    !managerHasAccepted &&
    !carrierHasBeenAssigned;

  const managerNeedsToAssignCarrier =
    effectivePerspective === "manager" &&
    status === "pending" &&
    managerHasAccepted &&
    !carrierHasBeenAssigned;

  const managerWaitingForCarrier =
    effectivePerspective === "manager" &&
    status === "pending" &&
    managerHasAccepted &&
    carrierHasBeenAssigned;

  const carrierNeedsToRespond =
    effectivePerspective === "carrier" &&
    status === "pending" &&
    managerHasAccepted &&
    carrierHasBeenAssigned &&
    carrierOrganisationId === viewerOrganisationId;

  /* =========================================================
     ACTION RUNNER
  ========================================================= */

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
            ? "border-green-200 bg-green-50 text-green-700"
            : "border-red-200 bg-red-50 text-red-700"
        }`}
      >
        {message.text}
      </div>
    );
  }

  const wrapperClass = isInline
    ? "space-y-2"
    : "space-y-3 rounded-2xl border bg-white p-6";

  const buttonClass =
    "w-full rounded py-2 text-sm font-medium transition disabled:opacity-50";

  /* =========================================================
     COMPLIANCE
  ========================================================= */

  if (effectivePerspective === "compliance") {
    return (
      <div className={isInline ? "text-xs text-gray-400" : wrapperClass}>
        {!isInline && <h2 className="font-semibold">Compliance Actions</h2>}
        <p className="text-sm text-gray-500">Compliance view is read-only.</p>
      </div>
    );
  }

  /* =========================================================
     GENERATOR
  ========================================================= */

  if (effectivePerspective === "generator") {
    return (
      <div className={wrapperClass}>
        {!isInline && <h2 className="font-semibold">Generator Actions</h2>}

        <MessageBox />

        {status === "in_progress" && (
          <button
            disabled={loading}
            onClick={() =>
              runAction(() => completeAssignmentAction({ assignmentId }))
            }
            className={`${buttonClass} bg-green-600 text-white hover:bg-green-700`}
          >
            {loading ? "Working..." : "Confirm Completion"}
          </button>
        )}

        {!["completed", "cancelled", "rejected"].includes(status) && (
          <button
            disabled={loading}
            onClick={() =>
              runAction(() => cancelAssignmentAction({ assignmentId }))
            }
            className={`${buttonClass} bg-red-600 text-white hover:bg-red-700`}
          >
            {loading ? "Working..." : "Cancel Assignment"}
          </button>
        )}

        {["completed", "cancelled", "rejected"].includes(status) && (
          <p className="text-sm text-gray-500">No actions available.</p>
        )}
      </div>
    );
  }

  /* =========================================================
     MANAGER
  ========================================================= */

  if (effectivePerspective === "manager") {
    return (
      <div className={wrapperClass}>
        {!isInline && <h2 className="font-semibold">Manager Actions</h2>}

        <MessageBox />

        {managerNeedsToRespond && (
          <div className="grid grid-cols-2 gap-2">
            <button
              disabled={loading}
              onClick={() =>
                runAction(() => acceptAssignmentAction({ assignmentId }))
              }
              className={`${buttonClass} bg-green-600 text-white hover:bg-green-700`}
            >
              {loading ? "..." : "Accept"}
            </button>

            <button
              disabled={loading}
              onClick={() =>
                runAction(() => rejectAssignmentAction({ assignmentId }))
              }
              className={`${buttonClass} bg-red-600 text-white hover:bg-red-700`}
            >
              {loading ? "..." : "Reject"}
            </button>
          </div>
        )}

        {managerNeedsToAssignCarrier && (
          <p className="text-xs text-gray-500">
            Manager accepted. Assign a carrier from the assignment detail page.
          </p>
        )}

        {managerWaitingForCarrier && (
          <p className="text-xs text-gray-500">
            Carrier assigned. Waiting for carrier response.
          </p>
        )}

        {status === "accepted" && (
          <p className="text-xs text-gray-500">
            Carrier accepted. Collection can now move forward.
          </p>
        )}

        {status === "in_progress" && (
          <p className="text-xs text-gray-500">Collection is in progress.</p>
        )}

        {["completed", "rejected", "cancelled"].includes(status) && (
          <p className="text-xs text-gray-500">No actions available.</p>
        )}

        {!managerNeedsToRespond &&
          !managerNeedsToAssignCarrier &&
          !managerWaitingForCarrier &&
          ![
            "accepted",
            "in_progress",
            "completed",
            "rejected",
            "cancelled",
          ].includes(status) && (
            <p className="text-xs text-gray-500">No actions available.</p>
          )}
      </div>
    );
  }

  /* =========================================================
     CARRIER
  ========================================================= */

  if (effectivePerspective === "carrier") {
    return (
      <div className={wrapperClass}>
        {!isInline && <h2 className="font-semibold">Carrier Actions</h2>}

        <MessageBox />

        {carrierNeedsToRespond && (
          <div className="grid grid-cols-2 gap-2">
            <button
              disabled={loading}
              onClick={() =>
                runAction(() => acceptAssignmentAction({ assignmentId }))
              }
              className={`${buttonClass} bg-green-600 text-white hover:bg-green-700`}
            >
              {loading ? "..." : "Accept"}
            </button>

            <button
              disabled={loading}
              onClick={() =>
                runAction(() => rejectAssignmentAction({ assignmentId }))
              }
              className={`${buttonClass} bg-red-600 text-white hover:bg-red-700`}
            >
              {loading ? "..." : "Reject"}
            </button>
          </div>
        )}

        {status === "accepted" && (
          <p className="text-xs text-gray-500">
            Open the assignment to confirm collection.
          </p>
        )}

        {status === "in_progress" && (
          <p className="text-xs text-gray-500">
            Collection has been recorded. Waiting for completion.
          </p>
        )}

        {!carrierNeedsToRespond &&
          !["accepted", "in_progress"].includes(status) && (
            <p className="text-xs text-gray-500">No actions available.</p>
          )}
      </div>
    );
  }

  return null;
}
