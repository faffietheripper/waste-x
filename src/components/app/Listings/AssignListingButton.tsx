"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useAction } from "@/lib/actions/useAction";
import { useToast } from "@/components/ui/use-toast";
import { selectBidAction } from "@/modules/bids/actions/selectBidAction";

interface AssignListingButtonProps {
  listingId: number;
  bidId: number;
  offerAccepted?: boolean;

  /**
   * Temporary compatibility field.
   * In the manager-first workflow this is being used as an assignment lock.
   */
  assignedCarrierOrganisationId?: string | null;
  assignedManagerOrganisationId?: string | null;

  declinedOffer?: boolean;
  cancelledJob?: boolean;
}

export default function AssignListingButton({
  listingId,
  bidId,
  offerAccepted = false,
  assignedCarrierOrganisationId = null,
  assignedManagerOrganisationId = null,
  declinedOffer = false,
  cancelledJob = false,
}: AssignListingButtonProps) {
  const router = useRouter();
  const run = useAction();
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);

  const alreadyAssigned =
    !!assignedManagerOrganisationId || !!assignedCarrierOrganisationId;

  const isDisabled =
    loading ||
    declinedOffer ||
    cancelledJob ||
    offerAccepted ||
    alreadyAssigned;

  async function handleAssign() {
    if (isDisabled) return;

    setLoading(true);

    try {
      const result = await run(() =>
        selectBidAction({
          listingId,
          bidId,
        }),
      );

      if (!result?.success) {
        throw new Error(result?.message || "Failed to assign manager.");
      }

      toast({
        title: "Manager assigned",
        description:
          result.message ||
          "The winning bid organisation has been assigned as the waste manager.",
      });

      router.refresh();
    } catch (error: any) {
      console.error("ASSIGN LISTING ERROR:", error);

      toast({
        title: "Assignment failed",
        description: error?.message || "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  function getLabel() {
    if (loading) return "Assigning...";
    if (declinedOffer) return "Offer declined";
    if (cancelledJob) return "Job cancelled";
    if (offerAccepted) return "Offer accepted";
    if (alreadyAssigned) return "Manager assigned";

    return "Assign Manager";
  }

  return (
    <button
      type="button"
      onClick={handleAssign}
      disabled={isDisabled}
      className={`rounded-md px-4 py-2 text-sm font-medium transition ${
        isDisabled
          ? "cursor-not-allowed bg-gray-400 text-white"
          : "bg-orange-500 text-black hover:bg-orange-400"
      }`}
    >
      {getLabel()}
    </button>
  );
}