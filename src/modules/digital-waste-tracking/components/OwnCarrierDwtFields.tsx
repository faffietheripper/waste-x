"use client";
/* WASTE_X_OWN_CARRIER_DRIVER_DWT_V1 */

import { useState } from "react";

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

const inputClass =
  "h-12 w-full rounded-2xl border border-black/10 bg-[#faf8f4] px-4 text-sm text-black outline-none transition focus:border-orange-400 focus:bg-white focus:ring-2 focus:ring-orange-100 disabled:cursor-not-allowed disabled:bg-black/[0.03] disabled:text-black/40";

function reasonLabel(value: ReasonForNoRegistrationNumber) {
  const labels: Record<ReasonForNoRegistrationNumber, string> = {
    ON_SITE: "Movement within the same premises",
    HOUSEHOLD: "Householder transporting own waste",
    ONE_OFF: "One-off / infrequent waste transport",
    MARINE: "Marine licence / exempt movement",
  };

  return labels[value];
}

export default function OwnCarrierDwtFields({ canEdit, initial }: Props) {
  const [registrationNumber, setRegistrationNumber] = useState(
    initial.registrationNumber,
  );
  const [reason, setReason] = useState<ReasonForNoRegistrationNumber | "">(
    initial.reasonForNoRegistrationNumber,
  );
  const [meansOfTransport, setMeansOfTransport] = useState<MeansOfTransport>(
    initial.meansOfTransport,
  );

  const hasRegistration = Boolean(registrationNumber.trim());

  return (
    <div className="space-y-4">
      {canEdit ? (
        <input type="hidden" name="ownCarrierDwtPresent" value="1" />
      ) : null}

      <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-xs leading-5 text-orange-950/75">
        This is your organisation&apos;s own-carrier identity, not a registration
        belonging to the individual driver. Waste X reuses it for every own-fleet
        DWT movement. External drivers continue to use the selected haulier&apos;s
        carrier registration.
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em] text-black/40">
            Carrier registration number
          </span>
          <input
            name="ownCarrierRegistrationNumber"
            value={registrationNumber}
            disabled={!canEdit}
            onChange={(event) => {
              const next = event.target.value;
              setRegistrationNumber(next);
              if (next.trim()) setReason("");
            }}
            placeholder="Example: CBDU123456"
            className={inputClass}
          />
          <span className="mt-2 block text-xs leading-5 text-black/35">
            For a recycling company using its own drivers on public-road waste
            collections, this is normally the organisation&apos;s carrier registration.
          </span>
        </label>

        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em] text-black/40">
            Reason if no registration applies
          </span>
          <select
            name="ownCarrierReasonForNoRegistrationNumber"
            value={hasRegistration ? "" : reason}
            disabled={!canEdit || hasRegistration}
            onChange={(event) =>
              setReason(
                event.target.value as ReasonForNoRegistrationNumber | "",
              )
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
            Do not use an exception just because the organisation&apos;s registration
            has not been entered yet.
          </span>
        </label>

        <label className="block md:col-span-2">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em] text-black/40">
            Default means of transport
          </span>
          <select
            name="ownCarrierMeansOfTransport"
            value={meansOfTransport}
            disabled={!canEdit}
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

      {!canEdit ? (
        <p className="text-xs leading-5 text-black/40">
          Only organisation administrators or senior management can change this
          organisation-level DWT identity. You can still create or edit the driver.
        </p>
      ) : null}
    </div>
  );
}
