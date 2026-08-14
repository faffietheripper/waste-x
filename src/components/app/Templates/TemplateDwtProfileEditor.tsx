"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { updateTemplateDwtProfileAction } from "@/modules/templates/actions/templateActions";
import {
  createBlankDwtListingProfile,
  formatDwtHazardAnswer,
  getDwtListingProfileReadiness,
  normaliseDwtListingProfile,
  safeParseDwtListingProfile,
  type DwtHazardAnswer,
  type DwtListingProfile,
  type DwtPhysicalForm,
  type DwtWeightMetric,
} from "@/modules/digital-waste-tracking/core/dwtListingProfile";

type Message = {
  type: "success" | "error";
  text: string;
};

const inputClass =
  "min-h-[3rem] w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition placeholder:text-black/25 focus:border-orange-400 focus:ring-2 focus:ring-orange-100 disabled:cursor-not-allowed disabled:bg-black/5 disabled:text-black/35";

export default function TemplateDwtProfileEditor({
  templateId,
  templateVersion,
  initialProfileJson,
  isLocked,
}: {
  templateId: string;
  templateVersion: number;
  initialProfileJson?: string | null;
  isLocked: boolean;
}) {
  const router = useRouter();

  const [profile, setProfile] = useState<DwtListingProfile>(() =>
    safeParseDwtListingProfile(initialProfileJson),
  );

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const readiness = useMemo(
    () => getDwtListingProfileReadiness(profile),
    [profile],
  );

  function updateProfile(updates: Partial<DwtListingProfile>) {
    setProfile((previous) =>
      normaliseDwtListingProfile({
        ...previous,
        ...updates,
      }),
    );
  }

  async function saveProfile() {
    if (saving || isLocked) return;

    setSaving(true);
    setMessage(null);

    try {
      await updateTemplateDwtProfileAction({
        templateId,
        profile: normaliseDwtListingProfile({
          ...profile,
          templateId,
          templateVersion,
          capturedAt: new Date().toISOString(),
          capturedFrom: "template_editor",
        }),
      });

      setMessage({
        type: "success",
        text: "DWT profile saved. Future listings using this template can inherit these defaults.",
      });

      router.refresh();
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to save DWT profile.",
      });
    } finally {
      setSaving(false);
    }
  }

  function clearProfile() {
    setProfile(createBlankDwtListingProfile());
  }

  const badgeClass =
    readiness.tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : readiness.tone === "warning"
        ? "border-orange-200 bg-orange-50 text-orange-700"
        : "border-black/10 bg-[#fbfaf7] text-black/50";

  return (
    <section className="rounded-3xl border border-orange-200 bg-orange-50/70 p-6 shadow-sm">
      <div className="flex flex-col gap-5 border-b border-orange-200 pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-orange-700">
            DWT-ready template
          </p>

          <h2 className="mt-2 text-2xl font-semibold text-black">
            Waste & DWT profile
          </h2>

          <p className="mt-2 max-w-4xl text-sm leading-6 text-orange-900/65">
            Optional defaults. These values prefill future listings created from
            this template, then the manager or receiver can confirm the final
            values during DWT intake.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <span
            className={`rounded-full border px-4 py-2 text-xs font-semibold ${badgeClass}`}
          >
            {readiness.label}
          </span>

          <button
            type="button"
            onClick={clearProfile}
            disabled={isLocked || saving}
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-black/45 transition hover:border-red-300 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear
          </button>

          <button
            type="button"
            onClick={saveProfile}
            disabled={isLocked || saving}
            className="rounded-full bg-black px-5 py-2 text-xs font-semibold text-orange-400 transition hover:bg-orange-500 hover:text-black disabled:cursor-not-allowed disabled:bg-black/20 disabled:text-black/30"
          >
            {saving ? "Saving..." : "Save DWT profile"}
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`mt-5 rounded-2xl border p-4 text-sm ${
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      {isLocked && (
        <div className="mt-5 rounded-2xl border border-orange-200 bg-white p-4 text-sm leading-6 text-orange-800">
          This template is locked. Unlock it before changing the DWT profile.
        </div>
      )}

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <Field label="EWC code(s)" helper="Example: 17 09 04. Separate multiple codes with commas.">
          <input
            disabled={isLocked}
            className={inputClass}
            value={profile.ewcCodes}
            onChange={(event) => updateProfile({ ewcCodes: event.target.value })}
            placeholder="17 09 04"
          />
        </Field>

        <Field label="Physical form">
          <select
            disabled={isLocked}
            className={inputClass}
            value={profile.physicalForm}
            onChange={(event) =>
              updateProfile({
                physicalForm: event.target.value as DwtPhysicalForm,
              })
            }
          >
            <option value="">Choose if known</option>
            <option value="Solid">Solid</option>
            <option value="Mixed">Mixed</option>
            <option value="Liquid">Liquid</option>
            <option value="Sludge">Sludge</option>
            <option value="Powder">Powder</option>
            <option value="Gas">Gas</option>
          </select>
        </Field>

        <div className="md:col-span-2">
          <Field
            label="DWT waste description"
            helper="This is the compliance-focused description that can prefill the DWT intake form."
          >
            <textarea
              disabled={isLocked}
              className={`${inputClass} min-h-24`}
              value={profile.wasteDescription}
              onChange={(event) =>
                updateProfile({ wasteDescription: event.target.value })
              }
              placeholder="Describe this waste type for DWT."
            />
          </Field>
        </div>

        <Field label="Container type">
          <input
            disabled={isLocked}
            className={inputClass}
            value={profile.typeOfContainers}
            onChange={(event) =>
              updateProfile({ typeOfContainers: event.target.value })
            }
            placeholder="Skip, bag, drum, loose load"
          />
        </Field>

        <Field label="Default number of containers">
          <input
            disabled={isLocked}
            className={inputClass}
            inputMode="numeric"
            value={profile.numberOfContainers}
            onChange={(event) =>
              updateProfile({ numberOfContainers: event.target.value })
            }
            placeholder="1"
          />
        </Field>

        <Field label="Default weight">
          <input
            disabled={isLocked}
            className={inputClass}
            inputMode="decimal"
            value={profile.weightAmount}
            onChange={(event) =>
              updateProfile({ weightAmount: event.target.value })
            }
            placeholder="2.5"
          />
        </Field>

        <Field label="Weight unit">
          <select
            disabled={isLocked}
            className={inputClass}
            value={profile.weightMetric}
            onChange={(event) =>
              updateProfile({
                weightMetric: event.target.value as DwtWeightMetric,
              })
            }
          >
            <option value="Tonnes">Tonnes</option>
            <option value="Kilograms">Kilograms</option>
            <option value="Grams">Grams</option>
          </select>
        </Field>

        <Field label="Weight type">
          <select
            disabled={isLocked}
            className={inputClass}
            value={profile.weightIsEstimate ? "estimate" : "actual"}
            onChange={(event) =>
              updateProfile({
                weightIsEstimate: event.target.value === "estimate",
              })
            }
          >
            <option value="estimate">Estimated</option>
            <option value="actual">Actual</option>
          </select>
        </Field>

        <Field label="Could contain POPs?">
          <select
            disabled={isLocked}
            className={inputClass}
            value={profile.containsPops}
            onChange={(event) =>
              updateProfile({
                containsPops: event.target.value as DwtHazardAnswer,
              })
            }
          >
            <option value="">Not set</option>
            <option value="no">{formatDwtHazardAnswer("no")}</option>
            <option value="yes">{formatDwtHazardAnswer("yes")}</option>
            <option value="unknown">
              {formatDwtHazardAnswer("unknown")}
            </option>
          </select>
        </Field>

        <Field label="Could be hazardous?">
          <select
            disabled={isLocked}
            className={inputClass}
            value={profile.containsHazardous}
            onChange={(event) =>
              updateProfile({
                containsHazardous: event.target.value as DwtHazardAnswer,
              })
            }
          >
            <option value="">Not set</option>
            <option value="no">{formatDwtHazardAnswer("no")}</option>
            <option value="yes">{formatDwtHazardAnswer("yes")}</option>
            <option value="unknown">
              {formatDwtHazardAnswer("unknown")}
            </option>
          </select>
        </Field>

        {profile.containsHazardous === "yes" && (
          <Field
            label="Hazardous property codes"
            helper="Example: HP1, HP3. Separate multiple codes with commas."
          >
            <input
              disabled={isLocked}
              className={inputClass}
              value={profile.hazardousHazCodes}
              onChange={(event) =>
                updateProfile({ hazardousHazCodes: event.target.value })
              }
              placeholder="HP codes"
            />
          </Field>
        )}

        <Field label="Recovery/disposal code" helper="Example: R5, R13, D15.">
          <input
            disabled={isLocked}
            className={inputClass}
            value={profile.disposalOrRecoveryCode}
            onChange={(event) =>
              updateProfile({ disposalOrRecoveryCode: event.target.value })
            }
            placeholder="R5"
          />
        </Field>

        <div className="md:col-span-2">
          <Field label="Special handling requirements">
            <textarea
              disabled={isLocked}
              className={`${inputClass} min-h-24`}
              value={profile.specialHandlingRequirements}
              onChange={(event) =>
                updateProfile({
                  specialHandlingRequirements: event.target.value,
                })
              }
              placeholder="Access notes, contamination concerns, PPE, quarantine instructions or compliance notes."
            />
          </Field>
        </div>
      </div>

      {(readiness.missing.length > 0 || readiness.warnings.length > 0) && (
        <div className="mt-6 rounded-2xl border border-orange-200 bg-white p-5">
          <p className="text-sm font-semibold text-black">
            Template readiness summary
          </p>

          <p className="mt-2 text-sm leading-6 text-black/50">
            Missing values do not block template saving. They will show as gaps
            on listing creation and DWT intake later.
          </p>

          {readiness.missing.length > 0 && (
            <p className="mt-3 text-sm leading-6 text-black/55">
              <span className="font-semibold text-black">Missing:</span>{" "}
              {readiness.missing.join(", ")}
            </p>
          )}

          {readiness.warnings.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 text-orange-800">
              {readiness.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function Field({
  label,
  helper,
  children,
}: {
  label: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-black">
        {label}
      </span>

      {children}

      {helper && (
        <span className="mt-2 block text-xs leading-5 text-black/40">
          {helper}
        </span>
      )}
    </label>
  );
}