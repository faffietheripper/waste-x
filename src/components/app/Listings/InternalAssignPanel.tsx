"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useAction } from "@/lib/actions/useAction";
import { useToast } from "@/components/ui/use-toast";
import { assignInternalCarrierAction } from "@/modules/listings/actions/assignInternalCarrierAction";

export default function InternalAssignPanel({
  listingId,
  carriers,
}: {
  listingId: number;
  carriers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const run = useAction();
  const { toast } = useToast();

  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false);

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
        throw new Error(result?.message || "Assignment failed");
      }

      toast({
        title: "Carrier assigned",
        description:
          result.message || "The internal carrier has been assigned.",
      });

      if (result.assignmentId) {
        router.push(`/home/operations/assignments/${result.assignmentId}`);
        return;
      }

      router.refresh();
    } catch (error: any) {
      console.error("ASSIGN ERROR:", error);

      toast({
        title: "Assignment failed",
        description: error?.message || "Failed to assign carrier.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-orange-600">
          Internal assignment
        </p>

        <h2 className="mt-2 text-xl font-semibold text-black">
          Assign Internal Carrier
        </h2>

        <p className="mt-1 text-sm text-black/50">
          Select a carrier department from your organisation to handle this
          listing.
        </p>
      </div>

      <select
        value={selected}
        onChange={(event) => setSelected(event.target.value)}
        className="rounded-xl border border-black/10 bg-[#f7f3ed] p-3 text-sm text-black outline-none transition focus:border-orange-400"
      >
        <option value="">Select carrier department</option>

        {carriers.map((carrier) => (
          <option key={carrier.id} value={carrier.id}>
            {carrier.name}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={handleAssign}
        disabled={!selected || loading}
        className="rounded-2xl bg-black px-5 py-3 text-sm font-semibold text-orange-400 transition hover:bg-orange-500 hover:text-black disabled:cursor-not-allowed disabled:bg-black/10 disabled:text-black/35"
      >
        {loading ? "Assigning..." : "Assign Carrier"}
      </button>
    </div>
  );
}