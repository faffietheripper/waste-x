"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addSection } from "@/app/home/team-dashboard/template-library/actions";
import { useAction } from "@/lib/actions/useAction";

export default function AddSectionModal({
  templateId,
  onClose,
}: {
  templateId: string;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);

  const router = useRouter();
  const run = useAction();

  async function handleSubmit() {
    if (!title.trim()) return;

    setLoading(true);

    try {
      await run(() => addSection(templateId, title.trim()));

      router.refresh();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
      <div className="bg-white p-8 w-96 rounded-xl space-y-4">
        <h2 className="text-lg font-semibold">Add Section</h2>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Section title"
          className="w-full border p-3 rounded-md"
        />

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="text-gray-500"
          >
            Cancel
          </button>

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="bg-black text-white px-5 py-2 rounded-md disabled:opacity-50"
          >
            {loading ? "Adding..." : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}
