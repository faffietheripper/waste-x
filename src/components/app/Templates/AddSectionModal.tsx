"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addSection } from "@/app/home/team-dashboard/template-library/actions";

export default function AddSectionModal({
  templateId,
  onClose,
}: {
  templateId: string;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const router = useRouter(); // ✅ inside component

  async function handleSubmit() {
    if (!title) return;

    await addSection(templateId, title);

    router.refresh(); // ✅ refresh AFTER action
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 text-black flex items-center justify-center">
      <div className="bg-white p-8 w-96">
        <h2 className="text-lg font-semibold mb-4">Add Section</h2>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Section title"
          className="w-full text-black border p-3 mb-4"
        />

        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="text-gray-500">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="bg-black text-white px-5 py-2"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
