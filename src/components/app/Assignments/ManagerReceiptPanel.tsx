"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { receiveWasteAction } from "@/modules/assignments/actions/receiveWasteAction";

type Message = {
  type: "success" | "error";
  text: string;
};

export default function ManagerReceiptPanel({
  assignmentId,
}: {
  assignmentId: string;
}) {
  const router = useRouter();

  const [verificationCode, setVerificationCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  async function handleReceiveWaste() {
    if (!verificationCode.trim()) {
      setMessage({
        type: "error",
        text: "Enter the verification code before confirming receipt.",
      });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const result = await receiveWasteAction({
        assignmentId,
        verificationCode,
      });

      if (!result?.success) {
        throw new Error(result?.message || "Failed to confirm waste receipt.");
      }

      setMessage({
        type: "success",
        text: result.message || "Waste receipt confirmed.",
      });

      setTimeout(() => {
        router.refresh();
      }, 700);
    } catch (err: any) {
      setMessage({
        type: "error",
        text: err.message || "Something went wrong.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <h2 className="font-semibold text-black">Confirm Waste Receipt</h2>

      <p className="mt-2 text-sm text-gray-500">
        Collection is in progress. Enter the verification code to confirm the
        waste has been received by the manager organisation and complete the
        workflow.
      </p>

      {message && (
        <div
          className={`mt-4 rounded-lg border p-3 text-sm ${
            message.type === "success"
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="mt-5 space-y-3">
        <input
          value={verificationCode}
          onChange={(e) => setVerificationCode(e.target.value)}
          placeholder="Enter verification code"
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500"
        />

        <button
          type="button"
          disabled={loading}
          onClick={handleReceiveWaste}
          className="w-full rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Confirming..." : "Confirm Receipt & Complete"}
        </button>
      </div>
    </div>
  );
}
