"use client";

import { useState } from "react";
import {
  createListingAction,
  createUploadUrlAction,
} from "@/app/home/create-waste-listings/actions";
import { DatePickerDemo } from "@/components/DatePicker";
import { Input } from "@/components/ui/input";
import { useAction } from "@/lib/actions/useAction";

/* =========================================================
   TYPES
========================================================= */

interface Template {
  id: string;
  sections: {
    id: string;
    title: string;
    fields: {
      id: string;
      key: string;
      label: string;
      fieldType: "text" | "number" | "dropdown" | "boolean" | "file";
      required?: boolean;
      optionsJson?: string | null;
    }[];
  }[];
}

/* =========================================================
   COMPONENT
========================================================= */

export default function DynamicWasteListingForm({
  template,
}: {
  template: Template;
}) {
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [projectName, setProjectName] = useState("");
  const [location, setLocation] = useState("");
  const [startingPrice, setStartingPrice] = useState<number | "">("");
  const [date, setDate] = useState<Date | undefined>();
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const run = useAction();

  function handleChange(key: string, value: any) {
    setFormValues((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  /* =========================================================
     VALIDATION
  ========================================================= */

  function validate(): string | null {
    if (!date) return "End date is required.";
    if (!projectName.trim()) return "Project name is required.";
    if (!location.trim()) return "Location is required.";
    if (startingPrice === "" || startingPrice < 0)
      return "Invalid starting price.";

    for (const section of template.sections) {
      for (const field of section.fields) {
        if (field.required && !formValues[field.key]) {
          return `Missing: ${field.label}`;
        }
      }
    }

    return null;
  }

  /* =========================================================
     SUBMIT
  ========================================================= */

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const error = validate();
    if (error) {
      // ❗ Let global system handle UX (you’ll wire toast later)
      console.error(error);
      return;
    }

    setSubmitting(true);

    try {
      /* ===============================
         FILE UPLOAD
      ============================== */

      let fileKeys: string[] = [];

      if (files.length > 0) {
        fileKeys = files.map((file) => `${crypto.randomUUID()}-${file.name}`);

        const uploadUrls = await run(() =>
          createUploadUrlAction(
            fileKeys,
            files.map((f) => f.type),
          ),
        );

        if (!uploadUrls || uploadUrls.length !== files.length) {
          throw new Error("File upload initialisation failed.");
        }

        await Promise.all(
          files.map((file, i) =>
            fetch(uploadUrls[i], {
              method: "PUT",
              body: file,
            }),
          ),
        );
      }

      /* ===============================
         CREATE LISTING
      ============================== */

      await run(() =>
        createListingAction({
          templateId: template.id,
          templateData: formValues,
          name: projectName,
          location,
          startingPrice: Number(startingPrice),
          endDate: date!,
          fileName: fileKeys,
        }),
      );
    } finally {
      setSubmitting(false);
    }
  }

  /* =========================================================
     UI
  ========================================================= */

  return (
    <form onSubmit={handleSubmit} className="space-y-10 max-w-3xl">
      {/* ================= TEMPLATE FIELDS ================= */}

      {template.sections.map((section) => (
        <div key={section.id}>
          <h3 className="text-lg font-semibold mb-4">{section.title}</h3>

          {section.fields.map((field) => (
            <div key={field.id} className="mb-5">
              <label className="block mb-2 font-medium">
                {field.label}
                {field.required && <span className="text-red-500 ml-1">*</span>}
              </label>

              {field.fieldType === "text" && (
                <input
                  className="border p-3 w-full rounded"
                  onChange={(e) => handleChange(field.key, e.target.value)}
                />
              )}

              {field.fieldType === "number" && (
                <input
                  type="number"
                  className="border p-3 w-full rounded"
                  onChange={(e) =>
                    handleChange(field.key, Number(e.target.value))
                  }
                />
              )}

              {field.fieldType === "boolean" && (
                <input
                  type="checkbox"
                  onChange={(e) => handleChange(field.key, e.target.checked)}
                />
              )}

              {field.fieldType === "dropdown" && (
                <select
                  className="border p-3 w-full rounded"
                  onChange={(e) => handleChange(field.key, e.target.value)}
                >
                  <option value="">Select...</option>

                  {JSON.parse(field.optionsJson || "[]").map((opt: string) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ))}
        </div>
      ))}

      {/* ================= PROJECT DETAILS ================= */}

      <div className="border-t pt-8 space-y-6">
        <h3 className="text-lg font-semibold">Project & Commercial Details</h3>

        <Input
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          placeholder="Project Name"
        />

        <Input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Location"
        />

        <Input
          type="number"
          value={startingPrice}
          onChange={(e) =>
            setStartingPrice(
              e.target.value === "" ? "" : Number(e.target.value),
            )
          }
          placeholder="Starting Price (£)"
        />

        <DatePickerDemo date={date} setDate={setDate} />

        <Input
          type="file"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files || []))}
        />
      </div>

      {/* ================= STATUS ================= */}

      {submitting && (
        <p className="text-sm text-gray-500">
          Processing listing and uploading files...
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="bg-black text-white px-6 py-3 rounded disabled:opacity-50"
      >
        {submitting ? "Creating..." : "Create Listing"}
      </button>
    </form>
  );
}
