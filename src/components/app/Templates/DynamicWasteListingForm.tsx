// src/components/app/Listings/DynamicWasteListingForm.tsx

"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { createListingAction } from "@/modules/listings/actions/createListingAction";
import { createUploadUrlAction } from "@/modules/shared/actions/createUploadUrlsAction";
import { DatePickerDemo } from "@/components/DatePicker";
import { Input } from "@/components/ui/input";
import { useAction } from "@/lib/actions/useAction";

/* =========================================================
   TYPES
========================================================= */

type TemplateFieldType = "text" | "number" | "dropdown" | "boolean" | "file";

interface TemplateField {
  id: string;
  key: string;
  label: string;
  fieldType: TemplateFieldType;
  required?: boolean;
  optionsJson?: string | null;
  helpText?: string | null;
}

interface TemplateSection {
  id: string;
  title: string;
  fields: TemplateField[];
}

interface Template {
  id: string;
  sections: TemplateSection[];
}

type ParticipationMode = "internal" | "external" | "mixed";

type MarketMode = "open_market" | "direct_award" | "internal_only" | "hybrid";

type ListingType = "waste_collection" | "material_sale" | "internal_transfer";

type CreateListingResult = {
  success?: boolean;
  message?: string;
  id?: number | string;
  listingId?: number | string;
  data?: {
    id?: number | string;
    listingId?: number | string;
  };
};

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

function parseOptions(optionsJson: string | null | undefined) {
  if (!optionsJson) return [];

  try {
    const parsed = JSON.parse(optionsJson);

    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((option) => String(option).trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function getActionMessage(
  result: CreateListingResult | null | undefined,
  fallback: string,
) {
  if (result && typeof result.message === "string" && result.message.trim()) {
    return result.message;
  }

  return fallback;
}

function getCreatedListingId(result: CreateListingResult | null | undefined) {
  if (!result) return null;

  const directId = result.id ?? result.listingId;

  if (directId !== undefined && directId !== null) {
    return String(directId);
  }

  const nestedId = result.data?.id ?? result.data?.listingId;

  if (nestedId !== undefined && nestedId !== null) {
    return String(nestedId);
  }

  return null;
}

function isMissingRequiredValue(value: unknown) {
  if (value === null || value === undefined) return true;

  if (typeof value === "string") {
    return value.trim().length === 0;
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  return false;
}

function getFieldTypeLabel(type: TemplateFieldType) {
  switch (type) {
    case "text":
      return "Text";
    case "number":
      return "Number";
    case "dropdown":
      return "Dropdown";
    case "boolean":
      return "Yes / No";
    case "file":
      return "File Upload";
    default:
      return "Field";
  }
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

  const [formValues, setFormValues] = useState<Record<string, unknown>>({});

  const [projectName, setProjectName] = useState("");
  const [location, setLocation] = useState("");
  const [startingPrice, setStartingPrice] = useState<number | "">("");
  const [date, setDate] = useState<Date | undefined>();
  const [files, setFiles] = useState<File[]>([]);

  const [participationMode, setParticipationMode] =
    useState<ParticipationMode>("external");

  const [marketMode, setMarketMode] = useState<MarketMode>("open_market");

  const [listingType, setListingType] =
    useState<ListingType>("waste_collection");

  const [allowedCarrierIds, setAllowedCarrierIds] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

  function handleChange(key: string, value: unknown) {
    setFormValues((previousValues) => ({
      ...previousValues,
      [key]: value,
    }));
  }

  function handleFileSelection(event: ChangeEvent<HTMLInputElement>) {
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
    if (!projectName.trim()) {
      return "Project name is required.";
    }

    if (!location.trim()) {
      return "Location is required.";
    }

    if (startingPrice === "" || Number(startingPrice) < 0) {
      return "Invalid starting price.";
    }

    if (!date) {
      return "End date is required.";
    }

    if (
      (participationMode === "internal" || participationMode === "mixed") &&
      marketMode !== "internal_only" &&
      !allowedCarrierIds.trim()
    ) {
      return "Allowed carriers are required for restricted modes.";
    }

    for (const section of template.sections) {
      for (const field of section.fields) {
        const value = formValues[field.key];

        if (field.required && isMissingRequiredValue(value)) {
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting) return;

    const validationError = validate();

    if (validationError) {
      alert(validationError);
      return;
    }

    if (!date) {
      alert("End date is required.");
      return;
    }

    setSubmitting(true);
    setUploadMessage(null);

    try {
      let fileKeys: string[] = [];

      if (files.length > 0) {
        fileKeys = files.map((file) => {
          return `listings/${crypto.randomUUID()}-${safeFileName(file.name)}`;
        });

        const uploadUrls = (await run(() =>
          createUploadUrlAction(
            fileKeys,
            files.map((file) => file.type),
          ),
        )) as string[] | null;

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

      const result = (await run(() =>
        createListingAction({
          templateId: template.id,
          templateData: formValues,

          name: projectName,
          location,
          startingPrice: Number(startingPrice),
          endDate: date,
          fileName: fileKeys,

          participationMode,
          marketMode,
          allowedCarrierIds: allowedCarrierIds
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean),

          listingType,
        }),
      )) as CreateListingResult | null;

      if (!result?.success) {
        throw new Error(getActionMessage(result, "Failed to create listing."));
      }

      const createdListingId = getCreatedListingId(result);

      alert("✅ Listing created successfully");

      resetForm();

      if (createdListingId) {
        router.push(`/home/marketplace/browse/${createdListingId}`);
      } else {
        router.push("/home/marketplace/browse");
      }

      router.refresh();
    } catch (error: unknown) {
      console.error("Create listing error:", error);

      const message =
        error instanceof Error ? error.message : "Failed to create listing.";

      alert(message);
    } finally {
      setSubmitting(false);
    }
  }

  /* =========================================================
     UI
  ========================================================= */

  return (
    <form onSubmit={handleSubmit} className="max-w-5xl space-y-8">
      {/* ================= TEMPLATE FIELDS ================= */}

      {template.sections.map((section) => (
        <section
          key={section.id}
          className="rounded-[1.75rem] border border-black/10 bg-white p-6 shadow-sm"
        >
          <div className="border-b border-black/10 pb-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-600">
              Template Section
            </p>

            <h3 className="mt-2 text-xl font-semibold text-black">
              {section.title}
            </h3>

            <p className="mt-2 text-sm leading-6 text-black/45">
              Complete the fields below for this part of the listing.
            </p>
          </div>

          {section.fields.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-black/15 bg-[#fbfaf7] p-6 text-sm text-black/45">
              This section has no fields yet.
            </div>
          ) : (
            <div className="mt-6 grid gap-5">
              {section.fields.map((field) => (
                <DynamicTemplateField
                  key={field.id}
                  field={field}
                  value={formValues[field.key]}
                  onChange={(value) => handleChange(field.key, value)}
                />
              ))}
            </div>
          )}
        </section>
      ))}

      {/* ================= BEHAVIOUR ================= */}

      <section className="rounded-[1.75rem] border border-black/10 bg-white p-6 shadow-sm">
        <div className="border-b border-black/10 pb-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-600">
            Marketplace Behaviour
          </p>

          <h3 className="mt-2 text-xl font-semibold text-black">
            Listing route and visibility
          </h3>

          <p className="mt-2 text-sm leading-6 text-black/45">
            Choose whether this listing goes to the open market, internal teams,
            or restricted carriers.
          </p>
        </div>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <FieldShell label="Participation Mode" required>
            <select
              className={inputClass}
              value={participationMode}
              onChange={(event) =>
                setParticipationMode(event.target.value as ParticipationMode)
              }
            >
              <option value="external">External (Open Market)</option>
              <option value="internal">Internal Only</option>
              <option value="mixed">Mixed</option>
            </select>
          </FieldShell>

          <FieldShell label="Market Mode" required>
            <select
              className={inputClass}
              value={marketMode}
              onChange={(event) =>
                setMarketMode(event.target.value as MarketMode)
              }
            >
              <option value="open_market">Open Market</option>
              <option value="direct_award">Direct Award</option>
              <option value="internal_only">Internal Only</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </FieldShell>

          <FieldShell label="Listing Type" required>
            <select
              className={inputClass}
              value={listingType}
              onChange={(event) =>
                setListingType(event.target.value as ListingType)
              }
            >
              <option value="waste_collection">Waste Collection</option>
              <option value="material_sale">Material Sale</option>
              <option value="internal_transfer">Internal Transfer</option>
            </select>
          </FieldShell>

          {(participationMode !== "external" ||
            marketMode !== "open_market") && (
            <FieldShell
              label="Allowed Carrier IDs"
              helper="Comma-separated organisation IDs. Example: org_123, org_456"
            >
              <input
                className={inputClass}
                value={allowedCarrierIds}
                onChange={(event) => setAllowedCarrierIds(event.target.value)}
                placeholder="org_123, org_456"
              />
            </FieldShell>
          )}
        </div>
      </section>

      {/* ================= PROJECT ================= */}

      <section className="rounded-[1.75rem] border border-black/10 bg-white p-6 shadow-sm">
        <div className="border-b border-black/10 pb-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-600">
            Project & Commercial Details
          </p>

          <h3 className="mt-2 text-xl font-semibold text-black">
            Listing basics
          </h3>

          <p className="mt-2 text-sm leading-6 text-black/45">
            Add the core details that will be shown on the listing.
          </p>
        </div>

        <div className="mt-6 grid gap-5">
          <FieldShell label="Project Name" required>
            <Input
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              placeholder="Project Name"
              className={inputClass}
            />
          </FieldShell>

          <FieldShell label="Location" required>
            <Input
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="Location"
              className={inputClass}
            />
          </FieldShell>

          <FieldShell label="Starting Price (£)" required>
            <Input
              type="number"
              value={startingPrice}
              onChange={(event) =>
                setStartingPrice(
                  event.target.value === "" ? "" : Number(event.target.value),
                )
              }
              placeholder="Starting Price (£)"
              className={inputClass}
            />
          </FieldShell>

          <FieldShell label="End Date" required>
            <DatePickerDemo date={date} setDate={setDate} />
          </FieldShell>

          <ListingImagesUpload
            files={files}
            submitting={submitting}
            uploadMessage={uploadMessage}
            onFileSelection={handleFileSelection}
            onRemoveFile={removeFile}
            onClearFiles={() => setFiles([])}
          />
        </div>
      </section>

      {/* ================= SUBMIT ================= */}

      <section className="sticky bottom-4 z-20 rounded-[1.75rem] border border-black/10 bg-black p-5 shadow-2xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-white">Create listing</p>

            <p className="mt-1 text-sm leading-6 text-white/45">
              This will create the listing using the selected template structure.
            </p>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="rounded-full bg-orange-500 px-6 py-3 text-sm font-semibold text-black transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/40"
          >
            {submitting ? "Creating..." : "Create Listing"}
          </button>
        </div>
      </section>
    </form>
  );
}

/* =========================================================
   FIELD RENDERER
========================================================= */

function DynamicTemplateField({
  field,
  value,
  onChange,
}: {
  field: TemplateField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const options = parseOptions(field.optionsJson);

  if (field.fieldType === "text") {
    return (
      <FieldShell
        label={field.label}
        required={field.required}
        helper={field.helpText}
        meta={getFieldTypeLabel(field.fieldType)}
      >
        <input
          value={String(value ?? "")}
          className={inputClass}
          onChange={(event) => onChange(event.target.value)}
        />
      </FieldShell>
    );
  }

  if (field.fieldType === "number") {
    return (
      <FieldShell
        label={field.label}
        required={field.required}
        helper={field.helpText}
        meta={getFieldTypeLabel(field.fieldType)}
      >
        <input
          type="number"
          value={
            typeof value === "number" || typeof value === "string"
              ? String(value)
              : ""
          }
          className={inputClass}
          onChange={(event) =>
            onChange(event.target.value === "" ? "" : Number(event.target.value))
          }
        />
      </FieldShell>
    );
  }

  if (field.fieldType === "dropdown") {
    return (
      <FieldShell
        label={field.label}
        required={field.required}
        helper={field.helpText}
        meta={getFieldTypeLabel(field.fieldType)}
      >
        <select
          value={String(value ?? "")}
          className={inputClass}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Select...</option>

          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </FieldShell>
    );
  }

  if (field.fieldType === "boolean") {
    const selectedValue =
      typeof value === "boolean" ? value : null;

    return (
      <FieldShell
        label={field.label}
        required={field.required}
        helper={field.helpText}
        meta={getFieldTypeLabel(field.fieldType)}
      >
        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          <button
            type="button"
            onClick={() => onChange(true)}
            className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
              selectedValue === true
                ? "border-orange-500 bg-orange-500 text-black shadow-sm"
                : "border-black/10 bg-white text-black/55 hover:border-orange-300 hover:bg-orange-50"
            }`}
          >
            Yes
          </button>

          <button
            type="button"
            onClick={() => onChange(false)}
            className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
              selectedValue === false
                ? "border-black bg-black text-white shadow-sm"
                : "border-black/10 bg-white text-black/55 hover:border-black/30 hover:bg-[#fbfaf7]"
            }`}
          >
            No
          </button>
        </div>

        {selectedValue === null && (
          <p className="mt-2 text-xs leading-5 text-black/35">
            Choose Yes or No.
          </p>
        )}
      </FieldShell>
    );
  }

  if (field.fieldType === "file") {
    return (
      <FieldShell
        label={field.label}
        required={field.required}
        helper={field.helpText}
        meta={getFieldTypeLabel(field.fieldType)}
      >
        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm leading-6 text-orange-800">
          Template file fields are not connected yet. Use the Listing Images
          upload field below for listing photos.
        </div>
      </FieldShell>
    );
  }

  return null;
}

/* =========================================================
   SMALL COMPONENTS
========================================================= */

const inputClass =
  "min-h-[3rem] w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition placeholder:text-black/25 focus:border-orange-400 focus:ring-2 focus:ring-orange-100";

function FieldShell({
  label,
  required = false,
  helper,
  meta,
  children,
}: {
  label: string;
  required?: boolean;
  helper?: string | null;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <label className="text-sm font-semibold text-black">
          {label}
          {required && <span className="ml-1 text-red-500">*</span>}
        </label>

        {meta && (
          <span className="rounded-full border border-black/10 bg-[#fbfaf7] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-black/45">
            {meta}
          </span>
        )}
      </div>

      {children}

      {helper && (
        <p className="mt-2 text-xs leading-5 text-black/40">{helper}</p>
      )}
    </div>
  );
}

function ListingImagesUpload({
  files,
  submitting,
  uploadMessage,
  onFileSelection,
  onRemoveFile,
  onClearFiles,
}: {
  files: File[];
  submitting: boolean;
  uploadMessage: string | null;
  onFileSelection: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: (index: number) => void;
  onClearFiles: () => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-black">
        Listing Images
      </label>

      <Input
        type="file"
        multiple
        accept="image/*"
        disabled={submitting}
        onChange={onFileSelection}
        className={inputClass}
      />

      <p className="mt-2 text-xs leading-5 text-black/40">
        You can select multiple images at once, or add images one by one.
        Selected images will be uploaded when you create the listing.
      </p>

      {uploadMessage && (
        <div className="mt-3 rounded-2xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
          {uploadMessage}
        </div>
      )}

      {files.length > 0 && (
        <div className="mt-4 rounded-2xl border border-black/10 bg-[#fbfaf7] p-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-semibold text-black">
              {files.length} image{files.length === 1 ? "" : "s"} selected
            </p>

            <button
              type="button"
              disabled={submitting}
              onClick={onClearFiles}
              className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-semibold text-black/50 transition hover:bg-orange-50 hover:text-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Clear all
            </button>
          </div>

          <div className="mt-3 space-y-2">
            {files.map((file, index) => (
              <div
                key={`${file.name}-${file.size}-${index}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
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
                  onClick={() => onRemoveFile(index)}
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
  );
}