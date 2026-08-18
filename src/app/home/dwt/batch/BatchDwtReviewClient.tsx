"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  applyBatchDwtReviewAction,
  prepareBatchDwtDraftsAction,
} from "./actions";
import type {
  BatchDraftRow,
  BatchLockedRow,
  BatchReviewRow,
} from "./page";

const MAX_BATCH_SIZE = 50;

function formatDate(value: string | null) {
  if (!value) return "Not recorded";

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return "Not recorded";
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function toggleSet(
  current: Set<string>,
  id: string,
) {
  const next = new Set(current);

  if (next.has(id)) next.delete(id);
  else next.add(id);

  return next;
}

export default function BatchDwtReviewClient({
  missingDrafts,
  reviewRows,
  lockedRows,
}: {
  missingDrafts: BatchDraftRow[];
  reviewRows: BatchReviewRow[];
  lockedRows: BatchLockedRow[];
}) {
  const [selectedDrafts, setSelectedDrafts] =
    useState<Set<string>>(new Set());

  const [selectedReceipts, setSelectedReceipts] =
    useState<Set<string>>(new Set());

  const [applySpecialHandling, setApplySpecialHandling] =
    useState(false);
  const [
    applyNoConsignmentReason,
    setApplyNoConsignmentReason,
  ] = useState(false);
  const [applyBrokerDealer, setApplyBrokerDealer] =
    useState(false);

  const [specialHandling, setSpecialHandling] =
    useState("");

  const [
    reasonForNoConsignmentCode,
    setReasonForNoConsignmentCode,
  ] = useState("NON_HAZ_WASTE_TRANSFER");

  const [brokerName, setBrokerName] = useState("");
  const [brokerAddress, setBrokerAddress] = useState("");
  const [brokerPostcode, setBrokerPostcode] = useState("");
  const [brokerEmail, setBrokerEmail] = useState("");
  const [brokerPhone, setBrokerPhone] = useState("");
  const [brokerRegistration, setBrokerRegistration] =
    useState("");

  const selectedReviewRows = useMemo(
    () =>
      reviewRows.filter((row) =>
        selectedReceipts.has(row.receiptId),
      ),
    [reviewRows, selectedReceipts],
  );

  const selectedHazardousCount =
    selectedReviewRows.filter(
      (row) => row.containsHazardous,
    ).length;

  const chosenFieldLabels = [
    applySpecialHandling
      ? "Special handling requirements"
      : null,
    applyNoConsignmentReason
      ? "Reason for no consignment code"
      : null,
    applyBrokerDealer
      ? "Broker / dealer"
      : null,
  ].filter(Boolean) as string[];

  return (
    <div className="mt-8 space-y-8">
      {/* =====================================================
          STEP 1 — PREPARE MISSING DRAFTS
      ===================================================== */}

      <section className="rounded-[30px] border border-black/10 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 border-b border-black/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-orange-600">
              Step 1
            </p>
            <h2 className="mt-1 text-2xl font-semibold">
              Prepare missing receipt drafts
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-black/45">
              This calls the same existing Job Load → Waste
              Receipt preparer for each selected completed load.
              Existing receipts are never overwritten.
            </p>
          </div>

          {missingDrafts.length > 0 ? (
            <button
              type="button"
              onClick={() =>
                setSelectedDrafts(
                  new Set(
                    missingDrafts
                      .slice(0, MAX_BATCH_SIZE)
                      .map((row) => row.jobLoadId),
                  ),
                )
              }
              className="rounded-full border border-black/10 px-4 py-2 text-xs font-semibold"
            >
              Select up to {MAX_BATCH_SIZE}
            </button>
          ) : null}
        </div>

        {missingDrafts.length === 0 ? (
          <EmptyState text="All eligible completed incoming loads already have a receipt draft." />
        ) : (
          <form action={prepareBatchDwtDraftsAction}>
            {Array.from(selectedDrafts).map((id) => (
              <input
                key={id}
                type="hidden"
                name="jobLoadId"
                value={id}
              />
            ))}

            <div className="mt-5 space-y-3">
              {missingDrafts.map((row) => (
                <LoadRow
                  key={row.jobLoadId}
                  row={row}
                  checked={selectedDrafts.has(row.jobLoadId)}
                  onChange={() =>
                    setSelectedDrafts((current) =>
                      toggleSet(current, row.jobLoadId),
                    )
                  }
                />
              ))}
            </div>

            <div className="mt-5 flex flex-col gap-3 rounded-2xl bg-black p-4 text-white sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-white/55">
                {selectedDrafts.size} load(s) selected
              </p>

              <button
                type="submit"
                disabled={selectedDrafts.size === 0}
                className="rounded-full bg-orange-500 px-5 py-2.5 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
              >
                Prepare selected drafts
              </button>
            </div>
          </form>
        )}
      </section>

      {/* =====================================================
          STEP 2 — SELECT PREPARED RECEIPTS
      ===================================================== */}

      <section className="rounded-[30px] border border-black/10 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 border-b border-black/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-orange-600">
              Step 2
            </p>
            <h2 className="mt-1 text-2xl font-semibold">
              Select prepared receipts
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-black/45">
              Only receipts with no DWT submission history are
              available for batch editing.
            </p>
          </div>

          {reviewRows.length > 0 ? (
            <button
              type="button"
              onClick={() =>
                setSelectedReceipts(
                  new Set(
                    reviewRows
                      .slice(0, MAX_BATCH_SIZE)
                      .map((row) => row.receiptId),
                  ),
                )
              }
              className="rounded-full border border-black/10 px-4 py-2 text-xs font-semibold"
            >
              Select up to {MAX_BATCH_SIZE}
            </button>
          ) : null}
        </div>

        {reviewRows.length === 0 ? (
          <EmptyState text="There are no unsubmitted prepared receipts available for batch review." />
        ) : (
          <div className="mt-5 space-y-3">
            {reviewRows.map((row) => (
              <ReviewRow
                key={row.receiptId}
                row={row}
                checked={selectedReceipts.has(row.receiptId)}
                onChange={() =>
                  setSelectedReceipts((current) =>
                    toggleSet(current, row.receiptId),
                  )
                }
              />
            ))}
          </div>
        )}
      </section>

      {/* =====================================================
          STEP 3 — SAFE COMMON FIELDS
      ===================================================== */}

      <form
        action={applyBatchDwtReviewAction}
        className="rounded-[30px] border border-black/10 bg-white p-6 shadow-sm"
      >
        {Array.from(selectedReceipts).map((id) => (
          <input
            key={id}
            type="hidden"
            name="receiptId"
            value={id}
          />
        ))}

        <div className="border-b border-black/10 pb-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-orange-600">
            Step 3
          </p>

          <h2 className="mt-1 text-2xl font-semibold">
            Apply common fields
          </h2>

          <p className="mt-2 max-w-4xl text-sm leading-6 text-black/45">
            Waste X will change only the fields you explicitly
            switch on below. Load-specific legal facts stay
            untouched.
          </p>
        </div>

        <div className="mt-5 space-y-4">
          <FieldToggle
            checked={applySpecialHandling}
            name="applySpecialHandling"
            label="Special handling requirements"
            description="Use only where the exact same handling instruction genuinely applies to every selected receipt."
            onChange={setApplySpecialHandling}
          >
            <textarea
              name="specialHandlingRequirements"
              value={specialHandling}
              onChange={(event) =>
                setSpecialHandling(event.target.value)
              }
              disabled={!applySpecialHandling}
              maxLength={5000}
              rows={4}
              className="mt-4 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm outline-none disabled:bg-black/[0.03] disabled:text-black/30"
              placeholder="Optional common handling instruction"
            />
          </FieldToggle>

          <FieldToggle
            checked={applyNoConsignmentReason}
            name="applyNoConsignmentReason"
            label="Reason for no hazardous consignment code"
            description="Conservative batch mode: Waste X refuses this field if any selected receipt is currently marked hazardous."
            onChange={setApplyNoConsignmentReason}
          >
            <select
              name="reasonForNoConsignmentCode"
              value={reasonForNoConsignmentCode}
              onChange={(event) =>
                setReasonForNoConsignmentCode(
                  event.target.value,
                )
              }
              disabled={!applyNoConsignmentReason}
              className="mt-4 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm outline-none disabled:bg-black/[0.03] disabled:text-black/30"
            >
              <option value="NON_HAZ_WASTE_TRANSFER">
                Non-hazardous waste transfer
              </option>
              <option value="NO_DOC_WITH_WASTE">
                No document came with the waste
              </option>
              <option value="HWRC_RECEIPT">
                Household waste recycling centre receipt
              </option>
            </select>

            {applyNoConsignmentReason &&
            selectedHazardousCount > 0 ? (
              <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-700">
                {selectedHazardousCount} selected receipt(s)
                are marked hazardous. This batch field will be
                refused; review those movements individually.
              </div>
            ) : null}
          </FieldToggle>

          <FieldToggle
            checked={applyBrokerDealer}
            name="applyBrokerDealer"
            label="Broker / dealer"
            description="Useful when the same broker or dealer genuinely applies across the selected movements."
            onChange={setApplyBrokerDealer}
          >
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Input
                name="brokerDealerOrganisationName"
                value={brokerName}
                onChange={setBrokerName}
                disabled={!applyBrokerDealer}
                placeholder="Organisation name"
              />
              <Input
                name="brokerDealerRegistrationNumber"
                value={brokerRegistration}
                onChange={setBrokerRegistration}
                disabled={!applyBrokerDealer}
                placeholder="Registration number"
              />
              <Input
                name="brokerDealerFullAddress"
                value={brokerAddress}
                onChange={setBrokerAddress}
                disabled={!applyBrokerDealer}
                placeholder="Full address"
              />
              <Input
                name="brokerDealerPostcode"
                value={brokerPostcode}
                onChange={setBrokerPostcode}
                disabled={!applyBrokerDealer}
                placeholder="Postcode"
              />
              <Input
                name="brokerDealerEmailAddress"
                value={brokerEmail}
                onChange={setBrokerEmail}
                disabled={!applyBrokerDealer}
                placeholder="Email"
                type="email"
              />
              <Input
                name="brokerDealerPhoneNumber"
                value={brokerPhone}
                onChange={setBrokerPhone}
                disabled={!applyBrokerDealer}
                placeholder="Phone"
              />
            </div>
          </FieldToggle>
        </div>

        {/* ===================================================
            PREVIEW
        =================================================== */}

        <div className="mt-6 rounded-3xl border border-orange-200 bg-orange-50 p-5">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-700">
                Preview
              </p>

              <h3 className="mt-1 text-lg font-semibold">
                {selectedReceipts.size} receipt(s) selected
              </h3>

              {chosenFieldLabels.length === 0 ? (
                <p className="mt-2 text-sm text-orange-800/70">
                  Switch on at least one common field.
                </p>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  {chosenFieldLabels.map((label) => (
                    <span
                      key={label}
                      className="rounded-full border border-orange-200 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-orange-700"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="max-w-xl text-sm leading-6 text-orange-900/70">
              <strong>Never changed by this batch:</strong>{" "}
              received time, EWC, waste description, physical
              form, containers, weight, POPs, hazardous
              classification, D/R codes, carrier registration,
              vehicle registration, receiving permit, WTID or
              submission records.
            </div>
          </div>

          {selectedReviewRows.length > 0 ? (
            <div className="mt-5 border-t border-orange-200 pt-4">
              <p className="text-xs font-semibold text-orange-900">
                Selected movements
              </p>

              <div className="mt-2 flex flex-wrap gap-2">
                {selectedReviewRows
                  .slice(0, 12)
                  .map((row) => (
                    <span
                      key={row.receiptId}
                      className="rounded-full bg-black px-3 py-1.5 text-[10px] font-semibold text-white"
                    >
                      {row.jobNumber} · L{row.loadNumber}
                    </span>
                  ))}

                {selectedReviewRows.length > 12 ? (
                  <span className="rounded-full bg-black/10 px-3 py-1.5 text-[10px] font-semibold">
                    +{selectedReviewRows.length - 12} more
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex flex-col gap-4 rounded-2xl bg-black p-5 text-white sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">
              Local batch review only
            </p>
            <p className="mt-1 text-xs text-white/45">
              No POST/PUT request is sent to Defra from this
              button.
            </p>
          </div>

          <button
            type="submit"
            disabled={
              selectedReceipts.size === 0 ||
              chosenFieldLabels.length === 0
            }
            className="rounded-full bg-orange-500 px-6 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            Apply selected fields
          </button>
        </div>
      </form>

      {/* =====================================================
          LOCKED
      ===================================================== */}

      <section className="rounded-[30px] border border-black/10 bg-white p-6 shadow-sm">
        <div className="border-b border-black/10 pb-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-black/35">
            Protected movements
          </p>
          <h2 className="mt-1 text-2xl font-semibold">
            Submission history / locked
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-black/45">
            These remain available through the existing single
            movement review/update flow and are never batch
            overwritten.
          </p>
        </div>

        {lockedRows.length === 0 ? (
          <EmptyState text="No protected movements in the current queue." />
        ) : (
          <div className="mt-5 space-y-3">
            {lockedRows.map((row) => (
              <div
                key={row.jobLoadId}
                className="rounded-2xl border border-black/10 bg-[#fbfaf7] p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold">
                      {row.jobNumber} · Load {row.loadNumber}
                    </p>
                    <p className="mt-1 text-xs text-black/45">
                      {row.reason}
                      {row.wasteTrackingId
                        ? ` · WTID ${row.wasteTrackingId}`
                        : ""}
                    </p>
                  </div>

                  <Link
                    href={`/home/dwt/intake/${row.jobLoadId}`}
                    className="rounded-full bg-black px-4 py-2 text-xs font-semibold text-white"
                  >
                    Open individually
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function LoadRow({
  row,
  checked,
  onChange,
}: {
  row: BatchDraftRow;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer gap-4 rounded-2xl border border-black/10 bg-[#fbfaf7] p-4">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="mt-1 size-5 accent-orange-500"
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="font-semibold">
            {row.jobNumber} · Load {row.loadNumber}
          </p>
          <span className="text-xs text-black/35">
            {formatDate(row.receivedAt)}
          </span>
        </div>

        <p className="mt-1 text-sm text-black/50">
          {row.clientName} · {row.originName}
        </p>

        <p className="mt-2 text-xs leading-5 text-black/40">
          {row.ewcCode} · {row.wasteDescription} ·{" "}
          {row.weightLabel} · Vehicle{" "}
          {row.vehicleRegistration}
        </p>
      </div>
    </label>
  );
}

function ReviewRow({
  row,
  checked,
  onChange,
}: {
  row: BatchReviewRow;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label
      className={`flex cursor-pointer gap-4 rounded-2xl border p-4 transition ${
        checked
          ? "border-orange-300 bg-orange-50"
          : "border-black/10 bg-[#fbfaf7]"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="mt-1 size-5 accent-orange-500"
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">
            {row.jobNumber} · Load {row.loadNumber}
          </p>

          {row.containsHazardous ? (
            <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-red-700">
              Hazardous
            </span>
          ) : (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
              Non-hazardous
            </span>
          )}
        </div>

        <p className="mt-1 text-sm text-black/50">
          {row.clientName} · {row.originName}
        </p>

        <p className="mt-2 text-xs leading-5 text-black/40">
          {row.ewcCode} · {row.wasteDescription} ·{" "}
          {row.weightLabel} · Vehicle{" "}
          {row.vehicleRegistration}
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {row.specialHandlingRequirements ? (
            <MiniPill text="Special handling set" />
          ) : null}

          {row.reasonForNoConsignmentCode ? (
            <MiniPill text="No-consignment reason set" />
          ) : null}

          {row.brokerDealerOrganisationName ? (
            <MiniPill
              text={`Broker: ${row.brokerDealerOrganisationName}`}
            />
          ) : null}
        </div>
      </div>
    </label>
  );
}

function FieldToggle({
  checked,
  name,
  label,
  description,
  onChange,
  children,
}: {
  checked: boolean;
  name: string;
  label: string;
  description: string;
  onChange: (value: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-3xl border p-5 transition ${
        checked
          ? "border-orange-300 bg-orange-50"
          : "border-black/10 bg-[#fbfaf7]"
      }`}
    >
      <label className="flex cursor-pointer items-start justify-between gap-6">
        <div>
          <p className="font-semibold">{label}</p>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-black/45">
            {description}
          </p>
        </div>

        <input
          type="checkbox"
          name={name}
          checked={checked}
          onChange={(event) =>
            onChange(event.target.checked)
          }
          className="mt-1 size-5 accent-orange-500"
        />
      </label>

      {children}
    </section>
  );
}

function Input({
  name,
  value,
  onChange,
  disabled,
  placeholder,
  type = "text",
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  placeholder: string;
  type?: string;
}) {
  return (
    <input
      name={name}
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm outline-none disabled:bg-black/[0.03] disabled:text-black/30"
    />
  );
}

function MiniPill({ text }: { text: string }) {
  return (
    <span className="rounded-full border border-black/10 bg-white px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-black/45">
      {text}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="mt-5 rounded-2xl border border-dashed border-black/15 bg-black/[0.02] p-8 text-center text-sm text-black/45">
      {text}
    </div>
  );
}
