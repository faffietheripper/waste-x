"use client";

import React, { useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import { createBidAction } from "@/modules/bids/actions/createBidAction";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";

/* =========================================================
   MAIN COMPONENT
========================================================= */

interface PlaceBidProps {
  listingId: number;
  currentBid: number;
}

export default function PlaceBid({ listingId, currentBid }: PlaceBidProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="w-full">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="w-full bg-blue-600 hover:bg-blue-700 transition text-white font-medium py-2 rounded-lg"
      >
        Place Bid
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <BidForm
              listingId={listingId}
              currentBid={currentBid}
              close={() => setOpen(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* =========================================================
   BID FORM
========================================================= */

function BidForm({
  listingId,
  currentBid,
  close,
}: {
  listingId: number;
  currentBid: number;
  close: () => void;
}) {
  const { toast } = useToast();
  const router = useRouter();

  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  const numericAmount = Number(amount);
  const isInvalid = !numericAmount || numericAmount <= currentBid || loading;

  /* =========================================================
     SUBMIT
  ========================================================= */

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isInvalid) return;

    setLoading(true);

    try {
      const result = await createBidAction({
        listingId,
        amount: numericAmount,
      });

      if (!result?.success) {
        toast({
          title: "Bid Failed",
          description: "Unable to place bid.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Bid placed",
        description: `You are now bidding £${numericAmount}`,
      });

      setAmount("");
      close();

      // ✅ refresh data properly (no full reload)
      router.refresh();
    } catch (error: any) {
      const code = error?.message;

      let message = "Something went wrong.";

      switch (code) {
        case "BID_TOO_LOW":
          message = "Your bid must be higher than the current bid.";
          break;
        case "BIDDING_CLOSED":
          message = "Bidding has already closed.";
          break;
        case "LISTING_NOT_FOUND":
          message = "Listing not found.";
          break;
        case "UNAUTHORISED":
          message = "You must be logged in to place a bid.";
          break;
      }

      toast({
        title: "Bid Failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  /* =========================================================
     UI
  ========================================================= */

  return (
    <div className="mt-4 bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
      <div className="text-sm text-gray-500 mb-3">
        Current bid: <span className="font-semibold">£{currentBid}</span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="number"
          min={currentBid + 1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={`Minimum £${currentBid + 1}`}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        />

        <button
          type="submit"
          disabled={isInvalid}
          className="w-full bg-blue-600 hover:bg-blue-700 transition text-white font-medium py-2 rounded-lg disabled:opacity-50"
        >
          {loading ? "Submitting..." : "Submit Bid"}
        </button>
      </form>
    </div>
  );
}
