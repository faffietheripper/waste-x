"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useAction } from "@/lib/actions/useAction";
import { useToast } from "@/components/ui/use-toast";
import { assignInternalCarrierAction } from "@/modules/listings/actions/assignInternalCarrierAction";

type StartSelfManagedJobButtonProps = {
  listingId: number;
  disabled?: boolean;
};

export default function StartSelfManagedJobButton({
  listingId,
  disabled = false,
}: StartSelfManagedJobButtonProps) {
  const router = useRouter();
  const run = useAction();
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);

  const isDisabled = disabled || loading;

  async function handleStart() {
    if (isDisabled) return;

    setLoading(true);

    try {
      const result = await run(() =>
        assignInternalCarrierAction({
          listingId,
          departmentId: null,
        }),
      );

      if (!result?.success) {
        throw new Error(result?.message || "Failed to start self-managed job.");
      }

      toast({
        title: "Self-managed job started",
        description:
          result.message ||
          "This listing has been converted into a self-managed job.",
      });

      if (result.assignmentId) {
        router.push(`/home/operations/assignments/${result.assignmentId}`);
        return;
      }

      router.refresh();
    } catch (error: any) {
      console.error("SELF MANAGED JOB ERROR:", error);

      toast({
        title: "Could not start job",
        description: error?.message || "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleStart}
      disabled={isDisabled}
      className={`w-full rounded-2xl px-5 py-3 text-sm font-semibold transition ${
        isDisabled
          ? "cursor-not-allowed bg-black/10 text-black/35"
          : "bg-black text-orange-400 hover:bg-orange-500 hover:text-black"
      }`}
    >
      {loading ? "Starting job..." : "Start self-managed job"}
    </button>
  );
}