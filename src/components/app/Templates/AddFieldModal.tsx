"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addFieldToSection } from "@/app/home/team-dashboard/template-library/actions";

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

  const router = useRouter();

  async function handleSubmit() {
    if (!label) return;

    await addFieldToSection({
      templateId,
      sectionId,
      key: label.toLowerCase().replace(/\s+/g, "_"),
      label,
      fieldType,
      required,
    });

    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 bg-black/40 text-black flex items-center justify-center">
      <div className="bg-white p-8 w-96">
        <h2 className="text-lg font-semibold mb-4">Add Field</h2>

        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Field label"
          className="w-full border text-black p-3 mb-4"
        />

        <select
          value={fieldType}
          onChange={(e) => setFieldType(e.target.value as any)}
          className="w-full border p-3 mb-4"
        >
          <option value="text">Text</option>
          <option value="number">Number</option>
          <option value="dropdown">Dropdown</option>
          <option value="boolean">Boolean</option>
          <option value="file">File Upload</option>
        </select>

        <label className="flex items-center gap-2 mb-4">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
          />
          Required
        </label>

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
