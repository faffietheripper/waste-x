"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { completeSoloManagedAssignmentAction } from "@/modules/assignments/actions/completeSoloManagedAssignmentAction";

export default function SoloManagerCompletionPanel({
  assignmentId,
}: {
  assignmentId: string;
}) {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  async function handleComplete() {
    if (loading) return;

    setLoading(true);
    setMessage(null);

    try {
      const result = await completeSoloManagedAssignmentAction({
        assignmentId,
      });

      if (!result?.success) {
        throw new Error(result?.message || "Failed to complete job.");
      }

      setMessage({
        type: "success",
        text:
          result.message ||
          "Solo job completed. Digital Waste Tracking can now begin.",
      });

      setTimeout(() => {
        router.refresh();
      }, 700);
    } catch (error: any) {
      setMessage({
        type: "error",
        text: error?.message || "Failed to complete job.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-3xl border border-green-200 bg-green-50 p-6 text-sm shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-green-700">
        Solo manager workflow
      </p>

      <h3 className="mt-3 text-lg font-semibold text-black">
        Complete this job yourself
      </h3>

      <p className="mt-2 leading-6 text-green-900/75">
        You accepted this job as the manager. Because this is a solo workspace
        with carrier capability, you can complete the job directly without
        choosing another carrier or using a collection code.
      </p>

      {message && (
        <div
          className={`mt-4 rounded-2xl border p-4 ${
            message.type === "success"
              ? "border-green-300 bg-white text-green-800"
              : "border-red-300 bg-red-50 text-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      <button
        type="button"
        onClick={handleComplete}
        disabled={loading}
        className="mt-5 w-full rounded-2xl bg-black px-5 py-4 text-sm font-semibold text-orange-400 transition hover:bg-orange-500 hover:text-black disabled:cursor-not-allowed disabled:bg-black/20 disabled:text-black/40"
      >
        {loading ? "Completing..." : "Complete job"}
      </button>
    </div>
  );
}