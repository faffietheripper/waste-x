"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { assignCarrierToAssignmentAction } from "@/modules/assignments/actions/assignCarrierToAssignmentAction";

type CarrierOption = {
  id: string;
  teamName: string;
  capabilities: ("generator" | "carrier" | "manager")[];
};

type Message = {
  type: "success" | "error";
  text: string;
};

export default function AssignCarrierPanel({
  assignmentId,
  carriers,
  currentOrganisationId,
}: {
  assignmentId: string;
  carriers: CarrierOption[];
  currentOrganisationId: string;
}) {
  const router = useRouter();

  const [carrierOrganisationId, setCarrierOrganisationId] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  async function handleAssignCarrier() {
    if (!carrierOrganisationId) {
      setMessage({
        type: "error",
        text: "Select a carrier organisation first.",
      });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const result = await assignCarrierToAssignmentAction({
        assignmentId,
        carrierOrganisationId,
      });

      if (!result?.success) {
        throw new Error(result?.message || "Failed to assign carrier.");
      }

      setMessage({
        type: "success",
        text: result.message || "Carrier assigned successfully.",
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

  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <h2 className="font-semibold text-black">Assign Carrier</h2>

      <p className="mt-2 text-sm text-gray-500">
        Select a carrier-capable organisation. This can be your own organisation
        for internal logistics, or a different carrier organisation.
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
        <select
          value={carrierOrganisationId}
          onChange={(e) => setCarrierOrganisationId(e.target.value)}
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500"
        >
          <option value="">Select carrier organisation</option>

          {carriers.map((carrier) => (
            <option key={carrier.id} value={carrier.id}>
              {carrier.teamName}
              {carrier.id === currentOrganisationId
                ? " — Internal logistics"
                : ""}
            </option>
          ))}
        </select>

        <button
          type="button"
          disabled={loading}
          onClick={handleAssignCarrier}
          className="w-full rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Assigning..." : "Assign Carrier"}
        </button>
      </div>
    </div>
  );
}
