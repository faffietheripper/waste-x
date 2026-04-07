"use client";

import Link from "next/link";
import { useState } from "react";
import { deleteBidAction } from "@/app/home/my-activity/my-bids/actions";
import { useToast } from "@/components/ui/use-toast";

interface ManageBidsProps {
  allBids: {
    id: number;
    amount: number;
    listingId: number;
    timestamp: Date;
  }[];
}

export default function ManageBids({ allBids }: ManageBidsProps) {
  const { toast } = useToast();

  const [loadingId, setLoadingId] = useState<number | null>(null);

  const hasBids = allBids.length > 0;

  /* =========================================================
     DELETE BID
  ========================================================= */

  async function handleDelete(bidId: number) {
    if (loadingId !== null) return;

    const confirmDelete = confirm("Are you sure you want to delete this bid?");

    if (!confirmDelete) return;

    setLoadingId(bidId);

    try {
      await deleteBidAction(bidId);

      toast({
        title: "Bid Deleted",
        description: "Your bid has been removed.",
      });
    } catch (error) {
      toast({
        title: "Delete Failed",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoadingId(null);
    }
  }

  /* =========================================================
     UI
  ========================================================= */

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">My Bids</h1>

      {hasBids ? (
        <ul className="space-y-4">
          {allBids.map((bid) => {
            const isLoading = loadingId === bid.id;

            return (
              <li
                key={bid.id}
                className="p-6 border rounded-lg shadow-sm flex justify-between items-center"
              >
                <div>
                  <div>
                    <strong>Bid Amount:</strong> £{bid.amount}
                  </div>
                  <div>
                    <strong>Listing ID:</strong> {bid.listingId}
                  </div>
                  <div>
                    <strong>Date:</strong>{" "}
                    {new Date(bid.timestamp).toLocaleString()}
                  </div>
                </div>

                <div className="flex gap-4">
                  <Link href={`/home/waste-listings/${bid.listingId}`}>
                    <button className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition">
                      View Listing
                    </button>
                  </Link>

                  <button
                    onClick={() => handleDelete(bid.id)}
                    disabled={isLoading}
                    className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition disabled:opacity-50"
                  >
                    {isLoading ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-gray-500">You have not placed any bids yet.</p>
      )}
    </div>
  );
}
