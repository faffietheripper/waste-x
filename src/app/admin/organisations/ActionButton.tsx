"use client";

import { useFormStatus } from "react-dom";

export function ApproveButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
    >
      {pending ? "Approving..." : "Approve"}
    </button>
  );
}

export function RejectButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="px-3 py-1 text-xs border border-red-500 text-red-500 rounded hover:bg-red-500 hover:text-white disabled:opacity-50"
    >
      {pending ? "Rejecting..." : "Reject"}
    </button>
  );
}
