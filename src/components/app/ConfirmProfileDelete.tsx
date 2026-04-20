"use client";

import React, { useState } from "react";
import { deleteAccountAction } from "@/app/home/settings/account/actions";
import { useToast } from "@/components/ui/use-toast";
import { useRouter } from "next/navigation";

export default function ConfirmProfileDelete() {
  const { toast } = useToast();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const CONFIRM_TEXT = "delete-my-account";

  async function handleDelete() {
    if (loading) return;

    if (input !== CONFIRM_TEXT) {
      toast({
        title: "Confirmation Required",
        description: `Type "${CONFIRM_TEXT}" to confirm deletion.`,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      await deleteAccountAction();

      toast({
        title: "Account Deleted",
        description: "Your account has been permanently removed.",
      });

      router.push("/");
    } catch (error) {
      toast({
        title: "Deletion Failed",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  function closeModal() {
    if (loading) return;
    setOpen(false);
    setInput("");
  }

  return (
    <>
      {/* TRIGGER */}
      <button
        onClick={() => setOpen(true)}
        className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition"
      >
        Delete Account
      </button>

      {/* MODAL */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center"
          onClick={closeModal}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-lg p-6 w-full max-w-md shadow-lg"
          >
            <h2 className="text-xl font-bold mb-4">Confirm Account Deletion</h2>

            <p className="mb-4 text-sm text-gray-600">
              Type{" "}
              <span className="font-semibold text-black">"{CONFIRM_TEXT}"</span>{" "}
              to confirm. This action cannot be undone.
            </p>

            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type confirmation text"
              className="w-full border p-2 rounded mb-4"
            />

            <div className="flex justify-end gap-3">
              <button
                onClick={closeModal}
                disabled={loading}
                className="bg-gray-300 px-4 py-2 rounded hover:bg-gray-400 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                onClick={handleDelete}
                disabled={loading}
                className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:opacity-50"
              >
                {loading ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
