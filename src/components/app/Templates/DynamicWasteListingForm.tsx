"use client";

import { useState } from "react";
import { createListingAction } from "@/modules/listings/actions/createListingAction";
import { createUploadUrlAction } from "@/modules/shared/actions/createUploadUrlsAction";
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

  /* ===============================
     NEW: BEHAVIOUR STATE
  ============================== */

  const [participationMode, setParticipationMode] = useState<
    "internal" | "external" | "mixed"
  >("external");

  const [marketMode, setMarketMode] = useState<
    "open_market" | "direct_award" | "internal_only" | "hybrid"
  >("open_market");

  const [allowedCarrierIds, setAllowedCarrierIds] = useState<string>("");

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

    if (
      (participationMode === "internal" || participationMode === "mixed") &&
      marketMode !== "internal_only" &&
      !allowedCarrierIds.trim()
    ) {
      return "Allowed carriers required for restricted modes.";
    }

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
      console.error(error);
      return;
    }

    setSubmitting(true);

    try {
      let fileKeys: string[] = [];

      if (files.length > 0) {
        fileKeys = files.map((file) => `${crypto.randomUUID()}-${file.name}`);

        const uploadUrls = await run(() =>
          createUploadUrlAction(
            fileKeys,
            files.map((f) => f.type),
          ),
        );

        await Promise.all(
          files.map((file, i) =>
            fetch(uploadUrls[i], {
              method: "PUT",
              body: file,
            }),
          ),
        );
      }

      await run(() =>
        createListingAction({
          templateId: template.id,
          templateData: formValues,

          name: projectName,
          location,
          startingPrice: Number(startingPrice),
          endDate: date!,
          fileName: fileKeys,

          /* 🔥 NEW */
          participationMode,
          marketMode,
          allowedCarrierIds: allowedCarrierIds
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean),
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
        <div key={section.id} className="bg-white p-6 rounded-lg border">
          <h3 className="text-lg font-semibold mb-4">{section.title}</h3>

          {section.fields.map((field) => (
            <div key={field.id} className="mb-5">
              <label className="block mb-2 font-medium text-gray-700">
                {field.label}
                {field.required && <span className="text-red-500 ml-1">*</span>}
              </label>

              {field.fieldType === "text" && (
                <input
                  className="border p-3 w-full rounded bg-white text-black"
                  onChange={(e) => handleChange(field.key, e.target.value)}
                />
              )}

              {field.fieldType === "number" && (
                <input
                  type="number"
                  className="border p-3 w-full rounded bg-white text-black"
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
                  className="border p-3 w-full rounded bg-white text-black"
                  onChange={(e) => handleChange(field.key, e.target.value)}
                >
                  <option value="">Select...</option>
                  {JSON.parse(field.optionsJson || "[]").map((opt: string) => (
                    <option key={opt}>{opt}</option>
                  ))}
                </select>
              )}
            </div>
          ))}
        </div>
      ))}

      {/* ================= BEHAVIOUR ================= */}

      <div className="bg-white p-6 rounded-lg border space-y-5">
        <h3 className="text-lg font-semibold">Marketplace Behaviour</h3>

        {/* Participation */}
        <div>
          <label className="text-sm font-medium">Participation Mode</label>
          <select
            className="border p-3 w-full rounded mt-1"
            value={participationMode}
            onChange={(e) => setParticipationMode(e.target.value as any)}
          >
            <option value="external">External (Open Market)</option>
            <option value="internal">Internal Only</option>
            <option value="mixed">Mixed</option>
          </select>
        </div>

        {/* Market */}
        <div>
          <label className="text-sm font-medium">Market Mode</label>
          <select
            className="border p-3 w-full rounded mt-1"
            value={marketMode}
            onChange={(e) => setMarketMode(e.target.value as any)}
          >
            <option value="open_market">Open Market</option>
            <option value="direct_award">Direct Award</option>
            <option value="internal_only">Internal Only</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </div>

        {/* Allowed carriers */}
        {(participationMode !== "external" || marketMode !== "open_market") && (
          <div>
            <label className="text-sm font-medium">
              Allowed Carrier IDs (comma separated)
            </label>
            <input
              className="border p-3 w-full rounded mt-1"
              value={allowedCarrierIds}
              onChange={(e) => setAllowedCarrierIds(e.target.value)}
              placeholder="org_123, org_456"
            />
          </div>
        )}
      </div>

      {/* ================= PROJECT ================= */}

      <div className="bg-white p-6 rounded-lg border space-y-5">
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

      {/* ================= SUBMIT ================= */}

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
