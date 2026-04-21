"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addFieldAction } from "@/modules/templates/actions/templateActions";

export default function AddFieldModal({
  templateId,
  sectionId,
  onClose,
}: {
  templateId: string;
  sectionId: string;
  onClose: () => void;
}) {
  const [label, setLabel] = useState("");
  const [fieldType, setFieldType] = useState<
    "text" | "number" | "dropdown" | "boolean" | "file"
  >("text");
  const [required, setRequired] = useState(false);
  const [loading, setLoading] = useState(false);

  const router = useRouter();

  /* =========================================================
     SUBMIT
  ========================================================= */

  async function handleSubmit() {
    if (!label.trim() || loading) return;

    setLoading(true);

    try {
      const key = label
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s]/g, "") // remove weird chars
        .replace(/\s+/g, "_");

      const res = await addFieldAction({
        templateId,
        sectionId,
        key,
        label,
        fieldType,
        required,
      });

      if (!res?.id) {
        throw new Error("Failed to add field");
      }

      onClose();
      router.refresh();
    } catch (err) {
      console.error("Add field error:", err);
      // (optional) plug toast here later
    } finally {
      setLoading(false);
    }
  }

  /* =========================================================
     UI
  ========================================================= */

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white p-8 w-96 rounded-xl space-y-4 shadow-xl">
        <h2 className="text-lg font-semibold">Add Field</h2>

        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Field label"
          className="w-full border p-3 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
        />

        <select
          value={fieldType}
          onChange={(e) =>
            setFieldType(
              e.target.value as
                | "text"
                | "number"
                | "dropdown"
                | "boolean"
                | "file",
            )
          }
          className="w-full border p-3 rounded-md focus:outline-none"
        >
          <option value="text">Text</option>
          <option value="number">Number</option>
          <option value="dropdown">Dropdown</option>
          <option value="boolean">Boolean</option>
          <option value="file">File Upload</option>
        </select>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
          />
          Required
        </label>

        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="text-gray-500 hover:text-black"
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
