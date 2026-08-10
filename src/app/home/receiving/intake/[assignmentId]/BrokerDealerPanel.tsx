// src/app/home/receiving/intake/[assignmentId]/BrokerDealerPanel.tsx

"use client";

import type { ReactNode } from "react";

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
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-black">
            4. Broker or dealer, if involved
          </h3>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-black/50">
            Only add this section if a broker or dealer was involved in
            arranging this waste movement.
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
          {enabled ? "Broker/dealer added" : "Add broker/dealer"}
        </button>
      </div>

      {!enabled && (
        <div className="mt-5 rounded-3xl border border-dashed border-black/15 bg-white p-5">
          <p className="text-sm font-semibold text-black">
            No broker or dealer added
          </p>

          <p className="mt-2 text-sm leading-6 text-black/45">
            Leave this section off when the movement was arranged directly
            between the waste holder, carrier and receiving site.
          </p>
        </div>
      )}

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
              placeholder="Organisation name"
            />
          </Field>

          <Field
            label="Registration number"
            helper="Add this if the broker or dealer has a registration number."
            error={issueMessagesFor(["brokerOrDealer.registrationNumber"])}
          >
            <input
              value={brokerOrDealer.registrationNumber}
              onChange={(event) =>
                update({ registrationNumber: event.target.value })
              }
              className={inputClassFor(["brokerOrDealer.registrationNumber"])}
              placeholder="Example: CBDU123456"
            />
          </Field>

          <Field label="Full address">
            <input
              value={brokerOrDealer.fullAddress}
              onChange={(event) => update({ fullAddress: event.target.value })}
              className={inputClassFor(["brokerOrDealer.address.fullAddress"])}
              placeholder="Full address"
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
              placeholder="Postcode"
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
              placeholder="Email address"
            />
          </Field>

          <Field label="Phone">
            <input
              value={brokerOrDealer.phoneNumber}
              onChange={(event) => update({ phoneNumber: event.target.value })}
              className={inputClassFor(["brokerOrDealer.phoneNumber"])}
              placeholder="Phone number"
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
  helper,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  helper?: string;
  error?: string[];
  children: ReactNode;
}) {
  const errors = error?.filter(Boolean) ?? [];

  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold text-black/55">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </span>

      {children}

      {helper && errors.length === 0 && (
        <span className="mt-2 block text-xs leading-5 text-black/35">
          {helper}
        </span>
      )}

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