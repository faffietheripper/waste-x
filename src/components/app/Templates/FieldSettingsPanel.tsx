"use client";

import { useState } from "react";
import {
  updateFieldAction,
  deleteFieldAction,
} from "@/modules/templates/actions/templateActions";
import { useAction } from "@/lib/actions/useAction";

/* =========================================================
   TYPES
========================================================= */

interface Field {
  id: string;
  label: string;
  required?: boolean;
}

/* =========================================================
   COMPONENT
========================================================= */

export default function FieldSettingsPanel({
  field,
  onClose,
}: {
  field: Field;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(field.label);
  const [required, setRequired] = useState(!!field.required);
  const [loading, setLoading] = useState(false);

  const run = useAction();

  /* =========================================================
     SAVE
  ========================================================= */

  async function handleSave() {
    if (!label.trim()) return;

    setLoading(true);

    try {
      await run(() =>
        updateFieldAction(field.id, {
          label: label.trim(),
          required,
        }),
      );

      onClose();
    } finally {
      setLoading(false);
    }
  }

  /* =========================================================
     DELETE
  ========================================================= */

  async function handleDelete() {
    setLoading(true);

    try {
      await run(() => deleteFieldAction(field.id));
      onClose();
    } finally {
      setLoading(false);
    }
  }

  /* =========================================================
     UI
  ========================================================= */

  return (
    <div className="w-80 border-l p-6 bg-gray-50 space-y-4">
      <h2 className="text-lg font-semibold">Field Settings</h2>

      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        className="w-full border p-3 rounded-md"
        placeholder="Field label"
      />

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={required}
          onChange={(e) => setRequired(e.target.checked)}
        />
        Required
      </label>

      <div className="flex justify-between pt-4">
        <button
          onClick={handleDelete}
          disabled={loading}
          className="text-red-600 disabled:opacity-50"
        >
          {loading ? "Processing..." : "Delete"}
        </button>

        <button
          onClick={handleSave}
          disabled={loading}
          className="bg-black text-white px-4 py-2 rounded-md disabled:opacity-50"
        >
          {loading ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
