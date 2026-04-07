"use client";

import { useToast } from "@/components/ui/use-toast";
import { useState } from "react";

interface AssignListingButtonProps {
  listingId: number;
  bidId: number;
  offerAccepted: boolean;
  assignedCarrierOrganisationId: string | null;
  declinedOffer: boolean;
  cancelledJob: boolean;
  handleAssignWinningBid: (
    formData: FormData,
  ) => Promise<{ success: boolean; message: string }>;
}

export default function AssignListingButton({
  listingId,
  bidId,
  offerAccepted,
  assignedCarrierOrganisationId,
  declinedOffer,
  cancelledJob,
  handleAssignWinningBid,
}: AssignListingButtonProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const isDisabled =
    loading ||
    declinedOffer ||
    cancelledJob ||
    offerAccepted ||
    assignedCarrierOrganisationId !== null;

  async function handleAssign() {
    if (loading) return;

    setLoading(true);

    const formData = new FormData();
    formData.append("listingId", listingId.toString());
    formData.append("bidId", bidId.toString());

    try {
      const result = await handleAssignWinningBid(formData);

      toast({
        title: result.success ? "Listing Assigned" : "Assignment Failed",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });
    } catch (error) {
      toast({
        title: "System Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  /* =========================================================
     DISABLED LABEL LOGIC
  ========================================================= */

  function getLabel() {
    if (declinedOffer) return "Offer Declined";
    if (cancelledJob) return "Job Cancelled";
    if (offerAccepted) return "Offer Accepted";
    if (assignedCarrierOrganisationId) return "Carrier Assigned";
    return "Unavailable";
  }

  return (
    <button
      onClick={!isDisabled ? handleAssign : undefined}
      disabled={isDisabled}
      className={`py-2 px-4 rounded-md text-white transition ${
        isDisabled
          ? "bg-gray-400 cursor-not-allowed"
          : "bg-blue-600 hover:bg-blue-700"
      }`}
    >
      {loading ? "Assigning..." : isDisabled ? getLabel() : "Assign Listing"}
    </button>
  );
}
