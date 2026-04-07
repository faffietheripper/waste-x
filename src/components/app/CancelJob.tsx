"use client";

import React, { useState } from "react";
import { motion, useMotionValue, useDragControls } from "framer-motion";
import { cancelJobAction } from "@/app/home/my-activity/assigned-jobs/actions";
import { useToast } from "@/components/ui/use-toast";

interface CancelJobPageProps {
  listingId: number;
  bidId: number;
}

export default function CancelJobPage({
  listingId,
  bidId,
}: CancelJobPageProps) {
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const y = useMotionValue(0);
  const controls = useDragControls();

  /* =========================================================
     CLOSE DRAWER (SAFE RESET)
  ========================================================= */

  function closeDrawer() {
    if (loading) return; // prevent closing mid-request
    setOpen(false);
    setReason("");
  }

  /* =========================================================
     SUBMIT
  ========================================================= */

  async function handleCancel(e: React.FormEvent) {
    e.preventDefault();

    if (loading) return;

    if (!reason.trim()) {
      toast({
        title: "Missing Reason",
        description: "Please provide a cancellation reason.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const result = await cancelJobAction({
        listingId,
        bidId,
        cancellationReason: reason,
      });

      toast({
        title: result.success ? "Job Cancelled" : "Cancellation Failed",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });

      if (result.success) {
        closeDrawer();
      }
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
     UI
  ========================================================= */

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 transition"
      >
        Cancel Job
      </button>

      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          onClick={closeDrawer}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: "0%" }}
            transition={{ ease: "easeInOut" }}
            drag="y"
            dragControls={controls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={() => {
              if (y.get() > 120) closeDrawer();
            }}
            style={{ y }}
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-0 w-full h-[75vh] rounded-t-3xl bg-neutral-900 border-t border-neutral-800 shadow-2xl"
          >
            {/* DRAG HANDLE */}
            <div className="flex justify-center pt-4">
              <button
                onPointerDown={(e) => controls.start(e)}
                className="h-1.5 w-12 rounded-full bg-neutral-600"
              />
            </div>

            {/* CONTENT */}
            <div className="max-w-2xl mx-auto px-6 pt-8 pb-12 overflow-y-auto h-full">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-white mb-2">
                  Cancel This Job
                </h2>
                <p className="text-sm text-neutral-400">
                  This will relist the waste listing and allow new bids.
                </p>
              </div>

              <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm p-4 rounded-xl mb-6">
                ⚠️ This action cannot be undone. Please provide a valid reason
                for audit and compliance purposes.
              </div>

              <form onSubmit={handleCancel} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
                    Cancellation Reason
                  </label>

                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Explain why this job is being cancelled..."
                    className="w-full h-40 rounded-xl bg-neutral-800 border border-neutral-700 p-4 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-red-500 transition"
                    required
                  />
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={closeDrawer}
                    disabled={loading}
                    className="px-4 py-2 rounded-lg bg-neutral-700 text-neutral-200 hover:bg-neutral-600 transition disabled:opacity-50"
                  >
                    Keep Job
                  </button>

                  <button
                    type="submit"
                    disabled={loading}
                    className="px-5 py-2 rounded-lg bg-red-600 text-white font-medium hover:bg-red-500 transition disabled:opacity-50"
                  >
                    {loading ? "Cancelling..." : "Confirm Cancellation"}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
