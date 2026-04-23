"use client";

import { useState } from "react";
import { useAction } from "@/lib/actions/useAction";
import { assignInternalCarrierAction } from "@/modules/listings/actions/assignInternalCarrierAction";
import { useRouter } from "next/navigation";

export default function InternalAssignPanel({
  listingId,
  carriers,
}: {
  listingId: number;
  carriers: { id: string; name: string }[];
}) {
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false);

  const run = useAction();
  const router = useRouter();

  /* ===============================
     ASSIGN HANDLER (FIXED)
  ============================== */

  async function handleAssign() {
    if (!selected || loading) return;

    setLoading(true);

    try {
      const result = await run(() =>
        assignInternalCarrierAction({
          listingId,
          departmentId: selected,
        }),
      );

      if (!result?.success) {
        throw new Error("Assignment failed");
      }

      alert("Carrier assigned successfully");
      router.refresh();
    } catch (err: any) {
      console.error("ASSIGN ERROR:", err);
      alert(err.message || "Failed to assign carrier");
    } finally {
      setLoading(false);
    }
  }

  /* ===============================
     UI
  ============================== */

  return (
    <div className="bg-white border rounded-2xl p-6 shadow-sm flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Assign Internal Carrier</h2>

      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="border p-2 rounded text-black"
      >
        <option value="">Select carrier department</option>

        {carriers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <button
        onClick={handleAssign}
        disabled={!selected || loading}
        className="bg-blue-600 text-white py-2 rounded disabled:opacity-50"
      >
        {loading ? "Assigning..." : "Assign Carrier"}
      </button>
    </div>
  );
}
