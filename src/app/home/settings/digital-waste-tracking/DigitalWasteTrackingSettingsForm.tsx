// src/app/home/settings/digital-waste-tracking/DigitalWasteTrackingSettingsForm.tsx

"use client";

import { useMemo, useState, useTransition } from "react";

import {
  updateWasteTrackingOrganisationSettingsAction,
  type UpdateWasteTrackingOrganisationSettingsIssue,
} from "@/modules/digital-waste-tracking/actions/updateWasteTrackingOrganisationSettingsAction";

import type { WasteTrackingEnvironment } from "@/modules/digital-waste-tracking/types/referenceData.types";

/* =========================================================
   TYPES
========================================================= */

type Props = {
  canEdit: boolean;
  initialSettings: {
    apiCode: string;
    environment: WasteTrackingEnvironment;
    isEnabled: boolean;
  };
};

type Feedback =
  | {
      type: "success" | "error" | "warning" | "info";
      title: string;
      message: string;
      details?: string[];
    }
  | null;

/* =========================================================
   HELPERS
========================================================= */

function cleanString(value: string) {
  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : "";
}

function isUuidLike(value: string) {
  if (!value.trim()) return true;

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}

function issueMessagesFor(
  issues: UpdateWasteTrackingOrganisationSettingsIssue[],
  field: string,
) {
  return issues
    .filter((issue) => issue.field === field)
    .map((issue) => issue.message);
}

function inputClassFor(hasIssue: boolean) {
  if (hasIssue) {
    return `${inputClass} border-red-300 bg-red-50 focus:border-red-400 focus:ring-red-100`;
  }

  return inputClass;
}

/* =========================================================
   COMPONENT
========================================================= */

export default function DigitalWasteTrackingSettingsForm({
  canEdit,
  initialSettings,
}: Props) {
  const [isPending, startTransition] = useTransition();

  const [apiCode, setApiCode] = useState(initialSettings.apiCode);
  const [environment, setEnvironment] = useState<WasteTrackingEnvironment>(
    initialSettings.environment,
  );
  const [isEnabled, setIsEnabled] = useState(initialSettings.isEnabled);

  const [feedback, setFeedback] = useState<Feedback>(null);
  const [issues, setIssues] = useState<
    UpdateWasteTrackingOrganisationSettingsIssue[]
  >([]);

  const hasUnsavedChanges = useMemo(() => {
    return (
      apiCode !== initialSettings.apiCode ||
      environment !== initialSettings.environment ||
      isEnabled !== initialSettings.isEnabled
    );
  }, [
    apiCode,
    environment,
    isEnabled,
    initialSettings.apiCode,
    initialSettings.environment,
    initialSettings.isEnabled,
  ]);

  const apiCodeIssues = issueMessagesFor(issues, "apiCode");
  const environmentIssues = issueMessagesFor(issues, "environment");
  const permissionIssues = issueMessagesFor(issues, "permission");

  function validateClientSide() {
    const nextIssues: UpdateWasteTrackingOrganisationSettingsIssue[] = [];

    const cleanedApiCode = cleanString(apiCode);

    if (!canEdit) {
      nextIssues.push({
        field: "permission",
        message:
          "Your role can view these settings, but it cannot update them.",
      });
    }

    if (isEnabled && !cleanedApiCode) {
      nextIssues.push({
        field: "apiCode",
        message:
          "Receiver API Code is required before enabling Digital Waste Tracking.",
      });
    }

    if (cleanedApiCode && !isUuidLike(cleanedApiCode)) {
      nextIssues.push({
        field: "apiCode",
        message:
          "Receiver API Code should look like a UUID. Check the code from Defra and try again.",
      });
    }

    if (environment === "production") {
      nextIssues.push({
        field: "environment",
        message:
          "Production should only be used when Defra has approved production access for this organisation.",
      });
    }

    return nextIssues;
  }

  function handleSave() {
    setFeedback(null);
    setIssues([]);

    const clientIssues = validateClientSide();

    const blockingIssues = clientIssues.filter((issue) => {
      if (
        issue.field === "environment" &&
        issue.message.includes("Production should only")
      ) {
        return false;
      }

      return true;
    });

    if (blockingIssues.length > 0) {
      setIssues(clientIssues);
      setFeedback({
        type: "error",
        title: "Settings not saved",
        message:
          "Waste X found issues before saving the Digital Waste Tracking settings.",
        details: [
          "Fix the highlighted fields.",
          "The Receiver API Code is required before enabling submissions.",
          "The client ID and client secret do not belong here. They stay in the server environment variables.",
        ],
      });
      return;
    }

    if (clientIssues.length > 0) {
      setIssues(clientIssues);
      setFeedback({
        type: "warning",
        title: "Check production access",
        message:
          "You selected production. Only continue if Defra has approved production access for this organisation.",
      });
    }

    startTransition(async () => {
      const result = await updateWasteTrackingOrganisationSettingsAction({
        apiCode: cleanString(apiCode),
        environment,
        isEnabled,
      });

      if (!result.success) {
        setIssues(result.issues ?? []);
        setFeedback({
          type: "error",
          title: "Settings not saved",
          message: result.message,
          details: result.issues?.map((issue) => issue.message),
        });
        return;
      }

      setIssues([]);
      setFeedback({
        type: result.settings.isEnabled ? "success" : "warning",
        title: result.settings.isEnabled
          ? "Digital Waste Tracking enabled"
          : "Settings saved, submissions disabled",
        message: result.message,
        details: [
          `Environment: ${result.settings.environment}`,
          result.settings.apiCode
            ? "Receiver API Code is saved against this organisation."
            : "No Receiver API Code is currently saved.",
        ],
      });
    });
  }

  function handleReset() {
    setApiCode(initialSettings.apiCode);
    setEnvironment(initialSettings.environment);
    setIsEnabled(initialSettings.isEnabled);
    setIssues([]);
    setFeedback({
      type: "info",
      title: "Changes reset",
      message: "The form has been reset to the last saved settings.",
    });
  }

  return (
    <section className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
      <div className="border-b border-black/10 pb-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-600">
          Organisation Configuration
        </p>

        <h2 className="mt-2 text-xl font-semibold text-black">
          Receiver API Code settings
        </h2>

        <p className="mt-2 text-sm leading-6 text-black/55">
          Save the Receiver API Code once so receive movement forms can load it
          automatically for this organisation.
        </p>

        <p className="mt-3 text-xs font-medium text-black/45">
          <span className="font-semibold text-red-500">*</span> Required when
          DWT submissions are enabled.
        </p>
      </div>

      {permissionIssues.length > 0 && (
        <div className="mt-5 rounded-3xl border border-orange-200 bg-orange-50 p-5 text-orange-800">
          <p className="text-sm font-semibold">View-only access</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6">
            {permissionIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 space-y-6">
        <Field
          label="Receiver API Code"
          required={isEnabled}
          helper="This code comes from Defra/Government registration for the receiving operator or site. It is not your client ID or client secret."
          errors={apiCodeIssues}
        >
          <input
            value={apiCode}
            disabled={!canEdit || isPending}
            onChange={(event) => setApiCode(event.target.value)}
            className={inputClassFor(apiCodeIssues.length > 0)}
            placeholder="1f83215e-4b90-4785-9ab2-2614839aa2e9"
          />
        </Field>

        <Field
          label="Environment"
          required
          helper="Use test while developing. Use production only after Defra has approved production access."
          errors={environmentIssues}
        >
          <select
            value={environment}
            disabled={!canEdit || isPending}
            onChange={(event) =>
              setEnvironment(event.target.value as WasteTrackingEnvironment)
            }
            className={inputClassFor(environmentIssues.length > 0)}
          >
            <option value="test">Test / Sandbox</option>
            <option value="production">Production</option>
          </select>
        </Field>

        <div className="rounded-3xl border border-black/10 bg-[#f7f3ed] p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-black">
                Enable Digital Waste Tracking submissions
              </p>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-black/50">
                When enabled, Waste X can use this Receiver API Code during
                receive movement submission. When disabled, the settings are
                saved but submissions are blocked.
              </p>
            </div>

            <button
              type="button"
              disabled={!canEdit || isPending}
              onClick={() => setIsEnabled((current) => !current)}
              className={`relative h-8 w-14 rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ${
                isEnabled ? "bg-orange-500" : "bg-black/20"
              }`}
            >
              <span
                className={`absolute top-1 h-6 w-6 rounded-full bg-white transition ${
                  isEnabled ? "left-7" : "left-1"
                }`}
              />
            </button>
          </div>

          <div className="mt-4">
            <span
              className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                isEnabled
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-orange-200 bg-orange-50 text-orange-700"
              }`}
            >
              {isEnabled ? "Enabled" : "Disabled"}
            </span>
          </div>
        </div>

        <div className="rounded-3xl border border-black/10 bg-[#f7f3ed] p-5">
          <p className="text-sm font-semibold text-black">
            What happens after saving?
          </p>

          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-black/55">
            <li>The receive movement form will load this code automatically.</li>
            <li>Users will not need to type the Receiver API Code every time.</li>
            <li>
              Defra client ID and client secret remain server-only environment
              variables.
            </li>
            <li>
              The code can be changed later if Defra issues a new one for the
              organisation.
            </li>
          </ul>
        </div>

        {feedback && (
          <div
            className={`rounded-3xl border p-5 ${
              feedback.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : feedback.type === "warning"
                  ? "border-orange-200 bg-orange-50 text-orange-800"
                  : feedback.type === "info"
                    ? "border-blue-200 bg-blue-50 text-blue-800"
                    : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            <p className="text-sm font-semibold">{feedback.title}</p>
            <p className="mt-2 text-sm leading-6">{feedback.message}</p>

            {feedback.details && feedback.details.length > 0 && (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6">
                {feedback.details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex flex-col gap-3 rounded-3xl border border-black/10 bg-black p-5 text-white md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold">
              Save Digital Waste Tracking settings
            </p>

            <p className="mt-2 text-sm leading-6 text-white/50">
              {canEdit
                ? hasUnsavedChanges
                  ? "You have unsaved changes."
                  : "No unsaved changes."
                : "You can view these settings, but your role cannot edit them."}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={!canEdit || isPending || !hasUnsavedChanges}
              onClick={handleReset}
              className="rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white/70 transition hover:border-orange-300 hover:text-orange-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Reset
            </button>

            <button
              type="button"
              disabled={!canEdit || isPending}
              onClick={handleSave}
              className="rounded-full bg-orange-500 px-6 py-3 text-sm font-semibold text-black transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/40"
            >
              {isPending ? "Saving..." : "Save settings"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* =========================================================
   SMALL UI
========================================================= */

const inputClass =
  "w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition placeholder:text-black/25 focus:border-orange-400 focus:ring-2 focus:ring-orange-100 disabled:cursor-not-allowed disabled:bg-black/5 disabled:text-black/35";

function Field({
  label,
  required = false,
  helper,
  errors,
  children,
}: {
  label: string;
  required?: boolean;
  helper?: string;
  errors?: string[];
  children: React.ReactNode;
}) {
  const fieldErrors = errors?.filter(Boolean) ?? [];

  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold text-black/55">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </span>

      {children}

      {helper && fieldErrors.length === 0 && (
        <span className="mt-2 block text-xs leading-5 text-black/35">
          {helper}
        </span>
      )}

      {fieldErrors.length > 0 && (
        <div className="mt-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-2">
          {fieldErrors.map((error) => (
            <p key={error} className="text-xs leading-5 text-red-700">
              {error}
            </p>
          ))}
        </div>
      )}
    </label>
  );
}