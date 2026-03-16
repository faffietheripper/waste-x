"use client";

import React, { useState } from "react";
import useMeasure from "react-use-measure";
import {
  useDragControls,
  useMotionValue,
  useAnimate,
  motion,
} from "framer-motion";
import { createReviewAction } from "@/app/home/my-activity/completed-jobs/actions";
import { useToast } from "@/components/ui/use-toast";

interface JobReviewProps {
  listingId: number;
  reviewedOrganisationId: string;
}

export default function JobReview({
  listingId,
  reviewedOrganisationId,
}: JobReviewProps) {
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!comment.trim()) {
      toast({
        title: "Missing Review",
        description: "Please provide your review.",
        variant: "destructive",
      });
      return;
    }

    if (!rating || rating < 1 || rating > 5) {
      toast({
        title: "Invalid Rating",
        description: "Please select a rating between 1 and 5.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const result = await createReviewAction({
        listingId,
        rating,
        reviewText: comment,
      });

      toast({
        title: result.success ? "Success" : "Error",
        description: result.message || result.error,
        variant: result.success ? "default" : "destructive",
      });

      if (result.success) {
        setOpen(false);
        setComment("");
        setRating(null);
      }
    } catch (error) {
      console.error("Error submitting review:", error);
      toast({
        title: "Error",
        description: "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={() => setOpen(true)}
        className="rounded bg-red-600 px-4 py-2 text-white hover:bg-red-500 transition"
      >
        Leave a Review
      </button>

      <DragCloseDrawer open={open} setOpen={setOpen}>
        <div className="mx-auto text-center space-y-6 text-neutral-400">
          <h2 className="text-xl font-bold text-neutral-200">
            Your feedback is important to us
          </h2>

          <form onSubmit={handleSubmit} className="flex flex-col space-y-4">
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="rounded-md p-4 h-40 bg-neutral-800 border border-neutral-700 text-white focus:ring-2 focus:ring-red-500 outline-none"
              placeholder="Leave your review..."
              required
            />

            <select
              value={rating ?? ""}
              onChange={(e) => setRating(Number(e.target.value))}
              className="rounded-md p-3 bg-neutral-800 border border-neutral-700 text-white"
              required
            >
              <option value="">Select Rating</option>
              <option value="5">⭐ 5 - Excellent</option>
              <option value="4">⭐ 4 - Very Good</option>
              <option value="3">⭐ 3 - Good</option>
              <option value="2">⭐ 2 - Fair</option>
              <option value="1">⭐ 1 - Poor</option>
            </select>

            <button
              type="submit"
              disabled={loading}
              className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-500 transition disabled:opacity-50"
            >
              {loading ? "Submitting..." : "Submit Review"}
            </button>
          </form>
        </div>
      </DragCloseDrawer>
    </div>
  );
}

interface DrawerProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  children: React.ReactNode;
}

function DragCloseDrawer({ open, setOpen, children }: DrawerProps) {
  const [scope, animate] = useAnimate();
  const y = useMotionValue(0);
  const controls = useDragControls();
  const [ref, { height }] = useMeasure();

  const handleClose = async () => {
    await animate(scope.current, { opacity: [1, 0] });
    setOpen(false);
  };

  if (!open) return null;

  return (
    <motion.div
      ref={scope}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div
        ref={ref}
        drag="y"
        dragControls={controls}
        dragConstraints={{ top: 0, bottom: height }}
        onDragEnd={(e, info) => {
          if (info.offset.y > 100) handleClose();
        }}
        style={{ y }}
        className="bg-neutral-900 w-full max-w-xl rounded-t-2xl p-8"
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
