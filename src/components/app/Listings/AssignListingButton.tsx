"use client";

import { useToast } from "@/components/ui/use-toast";
import { useState } from "react";
import { useAction } from "@/lib/actions/useAction";
import { selectBidAction } from "@/modules/bids/actions/selectBidAction";

interface AssignListingButtonProps {
  listingId: number;
  bidId: number;
  offerAccepted?: boolean;
  assignedCarrierOrganisationId?: string | null;
  declinedOffer?: boolean;
  cancelledJob?: boolean;
}

export default function AssignListingButton({
  listingId,
  bidId,
  offerAccepted = false,
  assignedCarrierOrganisationId = null,
  declinedOffer = false,
  cancelledJob = false,
}: AssignListingButtonProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const run = useAction();

  const isDisabled =
    loading ||
    declinedOffer ||
    cancelledJob ||
    offerAccepted ||
    !!assignedCarrierOrganisationId;

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

      toast({
        title: "Listing Assigned",
        description: result.message,
      });
    } catch (error: any) {
      console.error(error);

      toast({
        title: "Assignment Failed",
        description: error.message || "Something went wrong",
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
    if (assignedCarrierOrganisationId) return "Carrier Assigned";
    return "Assign Listing";
  }

  return (
    <button
      onClick={handleAssign}
      disabled={isDisabled}
      className={`py-2 px-4 rounded-md text-white transition ${
        isDisabled
          ? "bg-gray-400 cursor-not-allowed"
          : "bg-blue-600 hover:bg-blue-700"
      }`}
    >
      {getLabel()}
    </button>
  );
}
