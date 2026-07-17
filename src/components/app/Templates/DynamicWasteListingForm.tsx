"use client";

import { useState } from "react";
import { createListingAction } from "@/modules/listings/actions/createListingAction";
import { createUploadUrlAction } from "@/modules/shared/actions/createUploadUrlsAction";
import { DatePickerDemo } from "@/components/DatePicker";
import { Input } from "@/components/ui/input";
import { useAction } from "@/lib/actions/useAction";
import { useRouter } from "next/navigation";

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
   HELPERS
========================================================= */

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function safeFileName(name: string) {
  return name
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .toLowerCase();
}

/* =========================================================
   COMPONENT
========================================================= */

export default function DynamicWasteListingForm({
  template,
}: {
  template: Template;
}) {
  const router = useRouter();
  const run = useAction();

  const [formValues, setFormValues] = useState<Record<string, any>>({});

  const [projectName, setProjectName] = useState("");
  const [location, setLocation] = useState("");
  const [startingPrice, setStartingPrice] = useState<number | "">("");
  const [date, setDate] = useState<Date | undefined>();
  const [files, setFiles] = useState<File[]>([]);

  const [participationMode, setParticipationMode] = useState<
    "internal" | "external" | "mixed"
  >("external");

  const [marketMode, setMarketMode] = useState<
    "open_market" | "direct_award" | "internal_only" | "hybrid"
  >("open_market");

  const [listingType, setListingType] = useState<
    "waste_collection" | "material_sale" | "internal_transfer"
  >("waste_collection");

  const [allowedCarrierIds, setAllowedCarrierIds] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

  function handleChange(key: string, value: any) {
    setFormValues((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function handleFileSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files || []);

    if (selectedFiles.length === 0) return;

    const imageFiles = selectedFiles.filter((file) =>
      file.type.startsWith("image/"),
    );

    if (imageFiles.length !== selectedFiles.length) {
      setUploadMessage("Only image files can be uploaded.");
    } else {
      setUploadMessage(null);
    }

    setFiles((currentFiles) => {
      const existing = new Set(
        currentFiles.map((file) => `${file.name}-${file.size}`),
      );

      const newFiles = imageFiles.filter(
        (file) => !existing.has(`${file.name}-${file.size}`),
      );

      return [...currentFiles, ...newFiles];
    });

    /*
      This allows the user to select the same file again after removing it.
    */
    event.currentTarget.value = "";
  }

  function removeFile(index: number) {
    setFiles((currentFiles) =>
      currentFiles.filter((_, fileIndex) => fileIndex !== index),
    );
  }

  /* =========================================================
     VALIDATION
  ========================================================= */

  function validate(): string | null {
    if (!date) return "End date is required.";

    if (!projectName.trim()) {
      return "Project name is required.";
    }

    if (!location.trim()) {
      return "Location is required.";
    }

    if (startingPrice === "" || startingPrice < 0) {
      return "Invalid starting price.";
    }

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
     RESET
  ========================================================= */

  function resetForm() {
    setFormValues({});
    setProjectName("");
    setLocation("");
    setStartingPrice("");
    setDate(undefined);
    setFiles([]);
    setUploadMessage(null);

    setParticipationMode("external");
    setMarketMode("open_market");
    setAllowedCarrierIds("");
    setListingType("waste_collection");
  }

  /* =========================================================
     SUBMIT
  ========================================================= */

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (submitting) return;

    const error = validate();

    if (error) {
      alert(error);
      return;
    }

    setSubmitting(true);
    setUploadMessage(null);

    try {
      let fileKeys: string[] = [];

      if (files.length > 0) {
        fileKeys = files.map(
          (file) => `listings/${crypto.randomUUID()}-${safeFileName(file.name)}`,
        );

        console.log("FILES SELECTED:", files.length);
        console.log("FILE KEYS GENERATED:", fileKeys);

        const uploadUrls = await run(() =>
          createUploadUrlAction(
            fileKeys,
            files.map((file) => file.type),
          ),
        );

        if (!uploadUrls || uploadUrls.length !== fileKeys.length) {
          throw new Error("Failed to generate upload URLs for all files.");
        }

        await Promise.all(
          files.map(async (file, index) => {
            const url = uploadUrls[index];

            if (!url) {
              throw new Error(`Missing upload URL for ${file.name}.`);
            }

            const uploadResponse = await fetch(url, {
              method: "PUT",
              body: file,
              headers: {
                "Content-Type": file.type,
              },
            });

            if (!uploadResponse.ok) {
              throw new Error(`Failed to upload ${file.name}.`);
            }
          }),
        );
      }

      console.log("FILES SENT TO CREATE LISTING:", fileKeys);

      const result = await run(() =>
        createListingAction({
          templateId: template.id,
          templateData: formValues,

          name: projectName,
          location,
          startingPrice: Number(startingPrice),
          endDate: date!,
          fileName: fileKeys,

          participationMode,
          marketMode,
          allowedCarrierIds: allowedCarrierIds
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean),

          listingType,
        }),
      );

      if (!result?.success) {
        throw new Error(result?.message || "Failed to create listing.");
      }

      alert("✅ Listing created successfully");

      resetForm();

      router.push(`/home/marketplace/browse/${result.id}`);
      router.refresh();
    } catch (error: any) {
      console.error("Create listing error:", error);
      alert(error?.message || "Failed to create listing.");
    } finally {
      setSubmitting(false);
    }
  }

  /* =========================================================
     UI
  ========================================================= */

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-10">
      {/* ================= TEMPLATE FIELDS ================= */}

      {template.sections.map((section) => (
        <div
          key={section.id}
          className="rounded-lg border border-black/10 bg-white p-6"
        >
          <h3 className="mb-4 text-lg font-semibold text-black">
            {section.title}
          </h3>

          {section.fields.map((field) => (
            <div key={field.id} className="mb-5">
              <label className="mb-2 block font-medium text-gray-700">
                {field.label}
                {field.required && <span className="ml-1 text-red-500">*</span>}
              </label>

              {field.fieldType === "text" && (
                <input
                  value={formValues[field.key] ?? ""}
                  className="w-full rounded border border-black/10 bg-white p-3 text-black"
                  onChange={(event) =>
                    handleChange(field.key, event.target.value)
                  }
                />
              )}

              {field.fieldType === "number" && (
                <input
                  type="number"
                  value={formValues[field.key] ?? ""}
                  className="w-full rounded border border-black/10 bg-white p-3 text-black"
                  onChange={(event) =>
                    handleChange(
                      field.key,
                      event.target.value === ""
                        ? ""
                        : Number(event.target.value),
                    )
                  }
                />
              )}

              {field.fieldType === "boolean" && (
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={Boolean(formValues[field.key])}
                    onChange={(event) =>
                      handleChange(field.key, event.target.checked)
                    }
                  />

                  <span className="text-sm text-black/50">Yes / No</span>
                </div>
              )}

              {field.fieldType === "dropdown" && (
                <select
                  value={formValues[field.key] ?? ""}
                  className="w-full rounded border border-black/10 bg-white p-3 text-black"
                  onChange={(event) =>
                    handleChange(field.key, event.target.value)
                  }
                >
                  <option value="">Select...</option>

                  {JSON.parse(field.optionsJson || "[]").map((option: string) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              )}

              {field.fieldType === "file" && (
                <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm leading-6 text-orange-800">
                  Template file fields are not connected yet. Use the Listing
                  Images upload field below for listing photos.
                </div>
              )}
            </div>
          ))}
        </div>
      ))}

      {/* ================= BEHAVIOUR ================= */}

      <div className="space-y-5 rounded-lg border border-black/10 bg-white p-6">
        <h3 className="text-lg font-semibold text-black">
          Marketplace Behaviour
        </h3>

        <div>
          <label className="text-sm font-medium text-black">
            Participation Mode
          </label>

          <select
            className="mt-1 w-full rounded border border-black/10 bg-white p-3 text-black"
            value={participationMode}
            onChange={(event) =>
              setParticipationMode(event.target.value as any)
            }
          >
            <option value="external">External (Open Market)</option>
            <option value="internal">Internal Only</option>
            <option value="mixed">Mixed</option>
          </select>
        </div>

        <div>
          <label className="text-sm font-medium text-black">Market Mode</label>

          <select
            className="mt-1 w-full rounded border border-black/10 bg-white p-3 text-black"
            value={marketMode}
            onChange={(event) => setMarketMode(event.target.value as any)}
          >
            <option value="open_market">Open Market</option>
            <option value="direct_award">Direct Award</option>
            <option value="internal_only">Internal Only</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </div>

        <div>
          <label className="text-sm font-medium text-black">Listing Type</label>

          <select
            className="mt-1 w-full rounded border border-black/10 bg-white p-3 text-black"
            value={listingType}
            onChange={(event) => setListingType(event.target.value as any)}
          >
            <option value="waste_collection">Waste Collection</option>
            <option value="material_sale">Material Sale</option>
            <option value="internal_transfer">Internal Transfer</option>
          </select>
        </div>

        {(participationMode !== "external" || marketMode !== "open_market") && (
          <div>
            <label className="text-sm font-medium text-black">
              Allowed Carrier IDs comma separated
            </label>

            <input
              className="mt-1 w-full rounded border border-black/10 bg-white p-3 text-black"
              value={allowedCarrierIds}
              onChange={(event) => setAllowedCarrierIds(event.target.value)}
              placeholder="org_123, org_456"
            />
          </div>
        )}
      </div>

      {/* ================= PROJECT ================= */}

      <div className="space-y-5 rounded-lg border border-black/10 bg-white p-6">
        <h3 className="text-lg font-semibold text-black">
          Project & Commercial Details
        </h3>

        <Input
          value={projectName}
          onChange={(event) => setProjectName(event.target.value)}
          placeholder="Project Name"
        />

        <Input
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          placeholder="Location"
        />

        <Input
          type="number"
          value={startingPrice}
          onChange={(event) =>
            setStartingPrice(
              event.target.value === "" ? "" : Number(event.target.value),
            )
          }
          placeholder="Starting Price (£)"
        />

        <DatePickerDemo date={date} setDate={setDate} />

        {/* ================= FILE UPLOAD ================= */}

        <div>
          <label className="mb-2 block text-sm font-medium text-black">
            Listing Images
          </label>

          <Input
            type="file"
            multiple
            accept="image/*"
            disabled={submitting}
            onChange={handleFileSelection}
          />

          <p className="mt-2 text-xs leading-5 text-black/40">
            You can select multiple images at once, or add images one by one.
            Selected images will be uploaded when you create the listing.
          </p>

          {uploadMessage && (
            <div className="mt-3 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
              {uploadMessage}
            </div>
          )}

          {files.length > 0 && (
            <div className="mt-4 rounded-xl border border-black/10 bg-[#fbfaf7] p-4">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm font-semibold text-black">
                  {files.length} image{files.length === 1 ? "" : "s"} selected
                </p>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setFiles([])}
                  className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-semibold text-black/50 transition hover:bg-orange-50 hover:text-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Clear all
                </button>
              </div>

              <div className="mt-3 space-y-2">
                {files.map((file, index) => (
                  <div
                    key={`${file.name}-${file.size}-${index}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-black/70">
                        {file.name}
                      </p>

                      <p className="text-xs text-black/35">
                        {formatFileSize(file.size)}
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => removeFile(index)}
                      className="shrink-0 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ================= SUBMIT ================= */}

      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-black px-6 py-3 font-semibold text-white transition hover:bg-orange-500 hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? "Creating..." : "Create Listing"}
      </button>
    </form>
  );
}