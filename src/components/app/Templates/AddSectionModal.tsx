"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { addSectionAction } from "@/modules/templates/actions/templateActions";
import { useAction } from "@/lib/actions/useAction";

export default function AddSectionModal({
  templateId,
  onClose,
}: {
  templateId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const run = useAction();

  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  async function handleSubmit() {
    const cleanedTitle = title.trim();

    if (!cleanedTitle) {
      setMessage({
        type: "error",
        text: "Section title is required.",
      });
      return;
    }

    if (loading) return;

    setLoading(true);
    setMessage(null);

    try {
      const result = await run(() =>
        addSectionAction(templateId, cleanedTitle),
      );

      /*
        Current action returns the created section object.
        useAction returns null if it catches an error.
      */
      if (result === null) {
        setMessage({
          type: "error",
          text: "Failed to add section.",
        });
        return;
      }

      router.refresh();
      onClose();
    } catch (error: any) {
      console.error("Add section error:", error);

      setMessage({
        type: "error",
        text: error?.message || "Failed to add section.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-lg rounded-3xl border border-black/10 bg-white p-8 shadow-2xl">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
            Template Builder
          </p>

          <h2 className="mt-2 text-2xl font-semibold text-black">
            Add Section
          </h2>

          <p className="mt-2 text-sm leading-6 text-black/45">
            Sections group related listing fields together. For example: Waste
            Details, Site Information, Hazard Details or Pricing.
          </p>
        </div>

        {message && (
          <div
            className={`mb-5 rounded-2xl border p-4 text-sm ${
              message.type === "success"
                ? "border-green-200 bg-green-50 text-green-700"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {message.text}
          </div>
        )}

        <div>
          <label className="mb-2 block text-sm font-medium text-black">
            Section title
          </label>

          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="e.g. Waste Details"
            className="w-full rounded-2xl border border-black/10 bg-white p-4 text-sm text-black outline-none transition placeholder:text-black/30 focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
            autoFocus
          />
        </div>

        <div className="mt-8 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-black/50 transition hover:bg-[#fbfaf7] hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="rounded-full bg-orange-500 px-6 py-3 text-sm font-semibold text-black transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Adding..." : "Add Section"}
          </button>
        </div>
      </div>
    </div>
  );
}