"use client";

import { useState, useTransition } from "react";

import { updateOwnCarrierDwtSettingsAction } from "@/modules/digital-waste-tracking/actions/updateOwnCarrierDwtSettingsAction";
import {
  MEANS_OF_TRANSPORT,
  REASON_FOR_NO_REGISTRATION_NUMBER,
  type MeansOfTransport,
  type ReasonForNoRegistrationNumber,
} from "@/modules/digital-waste-tracking/types/receiveMovement.types";

type Props = {
  canEdit: boolean;
  initial: {
    registrationNumber: string;
    reasonForNoRegistrationNumber: ReasonForNoRegistrationNumber | "";
    meansOfTransport: MeansOfTransport;
  };
};

function reasonLabel(value: ReasonForNoRegistrationNumber) {
  const labels: Record<ReasonForNoRegistrationNumber, string> = {
    ON_SITE: "Moved on site",
    HOUSEHOLD: "Household waste",
    ONE_OFF: "One-off movement",
    MARINE: "Marine movement",
  };
  return labels[value];
}

const inputClass =
  "w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm text-black outline-none transition focus:border-orange-400 focus:bg-white";

export default function OwnCarrierDwtSettingsForm({ canEdit, initial }: Props) {
  const [isPending, startTransition] = useTransition();
  const [registrationNumber, setRegistrationNumber] = useState(
    initial.registrationNumber,
  );
  const [reason, setReason] = useState<ReasonForNoRegistrationNumber | "">(
    initial.reasonForNoRegistrationNumber,
  );
  const [meansOfTransport, setMeansOfTransport] = useState<MeansOfTransport>(
    initial.meansOfTransport,
  );
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  function save() {
    setFeedback(null);

    startTransition(async () => {
      const result = await updateOwnCarrierDwtSettingsAction({
        registrationNumber,
        reasonForNoRegistrationNumber: registrationNumber.trim() ? "" : reason,
        meansOfTransport,
      });

      setFeedback({
        type: result.success ? "success" : "error",
        message: result.message,
      });

      if (result.success) {
        setRegistrationNumber(result.settings.registrationNumber ?? "");
        setReason(result.settings.reasonForNoRegistrationNumber ?? "");
        setMeansOfTransport(result.settings.meansOfTransport);
      }
    });
  }

  return (
    <section className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
      <div className="border-b border-black/10 pb-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-600">
          Solo transport defaults
        </p>
        <h2 className="mt-2 text-xl font-semibold text-black">
          When your organisation is the carrier
        </h2>
        <p className="mt-2 text-sm leading-6 text-black/55">
          These fields are used only when a Job Load has no external haulier.
          They do not create a fake haulier record and they do not change the
          existing Defra API credentials or submission engine.
        </p>
      </div>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-xs font-semibold text-black/55">
            Carrier registration number
          </span>
          <input
            value={registrationNumber}
            disabled={!canEdit || isPending}
            onChange={(event) => {
              setRegistrationNumber(event.target.value);
              if (event.target.value.trim()) setReason("");
            }}
            className={inputClass}
            placeholder="Example: CBDU123456"
          />
          <span className="mt-2 block text-xs leading-5 text-black/35">
            Use the organisation's real registration when it transports waste.
          </span>
        </label>

        <label className="block">
          <span className="mb-2 block text-xs font-semibold text-black/55">
            Reason if registration is not applicable
          </span>
          <select
            value={registrationNumber.trim() ? "" : reason}
            disabled={!canEdit || isPending || Boolean(registrationNumber.trim())}
            onChange={(event) =>
              setReason(event.target.value as ReasonForNoRegistrationNumber | "")
            }
            className={inputClass}
          >
            <option value="">Choose only when genuinely applicable</option>
            {REASON_FOR_NO_REGISTRATION_NUMBER.map((value) => (
              <option key={value} value={value}>
                {reasonLabel(value)}
              </option>
            ))}
          </select>
          <span className="mt-2 block text-xs leading-5 text-black/35">
            Waste X will never invent a reason just because the registration is missing.
          </span>
        </label>

        <label className="block md:col-span-2">
          <span className="mb-2 block text-xs font-semibold text-black/55">
            Default means of transport
          </span>
          <select
            value={meansOfTransport}
            disabled={!canEdit || isPending}
            onChange={(event) =>
              setMeansOfTransport(event.target.value as MeansOfTransport)
            }
            className={inputClass}
          >
            {MEANS_OF_TRANSPORT.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>

      {feedback && (
        <div
          className={`mt-5 rounded-2xl border p-4 text-sm ${
            feedback.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {feedback.message}
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={!canEdit || isPending}
          className="rounded-full bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-500 hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? "Saving..." : "Save own transport defaults"}
        </button>
      </div>
    </section>
  );
}
