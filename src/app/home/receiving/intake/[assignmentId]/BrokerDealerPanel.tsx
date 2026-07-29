// src/app/home/receiving/intake/[assignmentId]/BrokerDealerPanel.tsx

"use client";

import type { BrokerDealerFormState } from "./receiveMovementFormTypes";

type Props = {
  enabled: boolean;
  brokerOrDealer: BrokerDealerFormState;
  onEnabledChange: (value: boolean) => void;
  onChange: (value: BrokerDealerFormState) => void;
  issueMessagesFor: (keys: string[]) => string[];
  inputClassFor: (keys: string[]) => string;
};

export default function BrokerDealerPanel({
  enabled,
  brokerOrDealer,
  onEnabledChange,
  onChange,
  issueMessagesFor,
  inputClassFor,
}: Props) {
  function update(patch: Partial<BrokerDealerFormState>) {
    onChange({
      ...brokerOrDealer,
      ...patch,
    });
  }

  return (
    <section
      id="broker-dealer-details"
      className="scroll-mt-32 rounded-3xl border border-black/10 bg-[#f7f3ed] p-6"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-black">
            Broker / dealer details
          </h3>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-black/50">
            Enable this when a broker or dealer is involved in the waste
            movement. This is required for DEFRA PAT scenario B01.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onEnabledChange(!enabled)}
          className={`rounded-full px-5 py-3 text-sm font-semibold transition ${
            enabled
              ? "bg-orange-500 text-black hover:bg-orange-400"
              : "border border-black/10 bg-white text-black/60 hover:border-orange-300"
          }`}
        >
          {enabled ? "Broker enabled" : "Add broker/dealer"}
        </button>
      </div>

      {enabled && (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field
            label="Broker/dealer organisation"
            required
            error={issueMessagesFor(["brokerOrDealer.organisationName"])}
          >
            <input
              value={brokerOrDealer.organisationName}
              onChange={(event) =>
                update({ organisationName: event.target.value })
              }
              className={inputClassFor(["brokerOrDealer.organisationName"])}
              placeholder="East Anglia Waste Brokerage Test Ltd"
            />
          </Field>

          <Field
            label="Registration number"
            error={issueMessagesFor(["brokerOrDealer.registrationNumber"])}
          >
            <input
              value={brokerOrDealer.registrationNumber}
              onChange={(event) =>
                update({ registrationNumber: event.target.value })
              }
              className={inputClassFor(["brokerOrDealer.registrationNumber"])}
              placeholder="CBDU123456"
            />
          </Field>

          <Field label="Full address">
            <input
              value={brokerOrDealer.fullAddress}
              onChange={(event) => update({ fullAddress: event.target.value })}
              className={inputClassFor(["brokerOrDealer.address.fullAddress"])}
              placeholder="1 Broker Test Road, Ipswich, Suffolk"
            />
          </Field>

          <Field
            label="Postcode"
            required
            error={issueMessagesFor(["brokerOrDealer.address.postcode"])}
          >
            <input
              value={brokerOrDealer.postcode}
              onChange={(event) => update({ postcode: event.target.value })}
              className={inputClassFor(["brokerOrDealer.address.postcode"])}
              placeholder="IP1 5SW"
            />
          </Field>

          <Field
            label="Email"
            error={issueMessagesFor(["brokerOrDealer.emailAddress"])}
          >
            <input
              value={brokerOrDealer.emailAddress}
              onChange={(event) => update({ emailAddress: event.target.value })}
              className={inputClassFor(["brokerOrDealer.emailAddress"])}
              placeholder="broker.test@wastextracking.com"
            />
          </Field>

          <Field label="Phone">
            <input
              value={brokerOrDealer.phoneNumber}
              onChange={(event) => update({ phoneNumber: event.target.value })}
              className={inputClassFor(["brokerOrDealer.phoneNumber"])}
              placeholder="01473 333333"
            />
          </Field>
        </div>
      )}
    </section>
  );
}

function Field({
  label,
  required = false,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string[];
  children: React.ReactNode;
}) {
  const errors = error?.filter(Boolean) ?? [];

  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold text-black/55">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </span>

      {children}

      {errors.length > 0 && (
        <div className="mt-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-2">
          {errors.map((item) => (
            <p key={item} className="text-xs leading-5 text-red-700">
              {item}
            </p>
          ))}
        </div>
      )}
    </label>
  );
}