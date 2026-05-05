"use client";

import { useToast } from "@/components/ui/use-toast";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAction } from "@/lib/actions/useAction";
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
  const { toast } = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const run = useAction();

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
        title: "Manager Assigned",
        description:
          result.message ||
          "The winning bid organisation has been assigned as the waste manager.",
      });

      router.refresh();
    } catch (error: any) {
      console.error(error);

      toast({
        title: "Assignment Failed",
        description: error.message || "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  function getLabel() {
    if (loading) return "Assigning...";
    if (declinedOffer) return "Offer Declined";
    if (cancelledJob) return "Job Cancelled";
    if (offerAccepted) return "Offer Accepted";
    if (alreadyAssigned) return "Manager Assigned";

    return "Assign Manager";
  }

  return (
    <button
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
