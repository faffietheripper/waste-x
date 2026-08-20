import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getJobLoadReceiveMovementDraft } from "@/modules/digital-waste-tracking/core/getJobLoadReceiveMovementDraft";
import { requireSoloPermission } from "@/modules/solo-permissions/core/requireSoloPermission";

import { saveDwtQuickFixAction, validateBatchDwtAction } from "../../actions";

type PageProps = {
  params: { jobLoadId: string };
};

const inputClass =
  "w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition placeholder:text-black/25 focus:border-orange-400 focus:ring-2 focus:ring-orange-100";

export default async function DwtBatchQuickFixPage({ params }: PageProps) {
  const context = await requireSoloPermission("dwt:review");

  const draft = await getJobLoadReceiveMovementDraft({
    organisationId: context.organisationId,
    jobLoadId: params.jobLoadId,
  });

  if (!draft) {
    redirect("/home/dwt/batch?error=quick_fix_draft_not_found");
  }

  if (draft.receiptStatus === "submitted") {
    redirect("/home/dwt/batch?error=quick_fix_already_submitted");
  }

  const validation = await validateBatchDwtAction([draft.jobLoadId]);
  const validationItem = validation.items[0] ?? null;
  const input = draft.receiveMovementInput;
  const wasteItem = input.wasteItems[0] ?? null;
  const disposalRecoveryCode = wasteItem?.disposalOrRecoveryCodes?.[0]?.code ?? "";

  return (
    <main className="min-h-screen bg-[#f4f1eb] pl-[22vw] pt-[14vh] text-black">
      <div className="px-10 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link href="/home/dwt/batch" className="text-sm font-semibold text-orange-700">
            ← Back to batch submission
          </Link>
          <Link
            href={`/home/dwt/intake/${draft.jobLoadId}`}
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-black/55"
          >
            Open full receipt editor
          </Link>
        </div>

        <section className="relative mt-6 overflow-hidden rounded-[34px] bg-black p-8 text-white shadow-sm">
          <div className="absolute -right-20 -top-24 size-72 rounded-full bg-red-500/15 blur-3xl" />
          <div className="relative z-10">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-400">
              DWT Batch · Quick Fix
            </p>
            <h1 className="mt-3 text-3xl font-semibold">
              {draft.jobNumber} · Load {draft.loadNumber}
            </h1>
            <p className="mt-2 text-sm text-white/50">
              {draft.clientName} · {draft.originName}
            </p>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-white/55">
              Correct the common receipt fields here, save, and return to the batch.
              Waste X will revalidate the movement automatically. Use the full editor only
              for complex hazardous, POP or multi-item corrections.
            </p>
          </div>
        </section>

        {validation.globalErrors.length > 0 ? (
          <section className="mt-6 rounded-[26px] border border-orange-200 bg-orange-50 p-5 text-orange-800">
            <p className="text-sm font-semibold">Organisation DWT settings also need attention</p>
            <div className="mt-2 space-y-1 text-sm">
              {validation.globalErrors.map((entry) => (
                <p key={entry}>• {entry}</p>
              ))}
            </div>
          </section>
        ) : null}

        {validationItem?.errors.length ? (
          <section className="mt-6 rounded-[26px] border border-red-200 bg-red-50 p-5 text-red-800">
            <p className="text-sm font-semibold">
              {validationItem.errors.length} issue{validationItem.errors.length === 1 ? "" : "s"} found
            </p>
            <div className="mt-3 space-y-2">
              {validationItem.errors.map((entry, index) => (
                <div key={`${entry.key}-${index}`} className="rounded-2xl bg-white/70 px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-red-600/70">
                    {entry.key}
                  </p>
                  <p className="mt-1 text-sm">{entry.message}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <form action={saveDwtQuickFixAction} className="mt-6 space-y-6">
          <input type="hidden" name="jobLoadId" value={draft.jobLoadId} />
          <input type="hidden" name="receiptId" value={draft.receiptId} />

          <section className="rounded-[30px] border border-black/[0.08] bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 border-b border-black/[0.06] pb-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-600">Waste received</p>
                <h2 className="mt-1 text-xl font-semibold">Factual load snapshot</h2>
              </div>
              <Link href={`/home/jobs/${draft.jobId}`} className="text-xs font-semibold text-black/45 hover:text-black">
                Open job →
              </Link>
            </div>

            {wasteItem ? (
              <>
                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <ReadOnly label="EWC" value={wasteItem.ewcCodes.join(", ") || "Missing"} />
                  <ReadOnly label="Weight" value={`${wasteItem.weight.amount} ${wasteItem.weight.metric}`} />
                  <ReadOnly label="Physical form" value={wasteItem.physicalForm} />
                </div>
                <div className="mt-3 rounded-2xl bg-black/[0.025] px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/30">Description</p>
                  <p className="mt-1.5 text-sm text-black/65">{wasteItem.wasteDescription}</p>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-3">
                  <Field label="Number of containers">
                    <input
                      name="numberOfContainers"
                      type="number"
                      min="0"
                      step="1"
                      defaultValue={wasteItem.numberOfContainers}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Container type">
                    <input
                      name="typeOfContainers"
                      defaultValue={wasteItem.typeOfContainers}
                      placeholder="Use the valid DWT container code"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Disposal / recovery code">
                    <input
                      name="disposalRecoveryCode"
                      defaultValue={disposalRecoveryCode}
                      placeholder="e.g. R5"
                      className={inputClass}
                    />
                  </Field>
                </div>
              </>
            ) : (
              <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                No waste item exists on this receipt. Use the full receipt editor.
              </div>
            )}
          </section>

          <section className="rounded-[30px] border border-black/[0.08] bg-white p-6 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-600">Movement</p>
            <h2 className="mt-1 text-xl font-semibold">Movement details</h2>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="Hazardous consignment code">
                <input
                  name="hazardousWasteConsignmentCode"
                  defaultValue={input.hazardousWasteConsignmentCode ?? ""}
                  className={inputClass}
                />
              </Field>
              <Field label="Reason for no consignment code">
                <select
                  name="reasonForNoConsignmentCode"
                  defaultValue={input.reasonForNoConsignmentCode ?? ""}
                  className={inputClass}
                >
                  <option value="">Not applicable</option>
                  <option value="NON_HAZ_WASTE_TRANSFER">Non-hazardous waste transfer</option>
                  <option value="NO_DOC_WITH_WASTE">No document came with waste</option>
                  <option value="HWRC_RECEIPT">HWRC receipt</option>
                </select>
              </Field>
              <div className="md:col-span-2">
                <Field label="Special handling requirements">
                  <textarea
                    name="specialHandlingRequirements"
                    defaultValue={input.specialHandlingRequirements ?? ""}
                    className={`${inputClass} min-h-24`}
                  />
                </Field>
              </div>
            </div>
          </section>

          <section className="rounded-[30px] border border-black/[0.08] bg-white p-6 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-600">Carrier</p>
            <h2 className="mt-1 text-xl font-semibold">Carrier details</h2>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="Registration number">
                <input name="carrierRegistrationNumber" defaultValue={input.carrier.registrationNumber ?? ""} className={inputClass} />
              </Field>
              <Field label="Reason for no registration">
                <select name="carrierReasonForNoRegistrationNumber" defaultValue={input.carrier.reasonForNoRegistrationNumber ?? ""} className={inputClass}>
                  <option value="">Not applicable</option>
                  <option value="ON_SITE">Moved on site</option>
                  <option value="HOUSEHOLD">Household waste</option>
                  <option value="ONE_OFF">One-off movement</option>
                  <option value="MARINE">Marine movement</option>
                </select>
              </Field>
              <Field label="Organisation name">
                <input name="carrierOrganisationName" defaultValue={input.carrier.organisationName} className={inputClass} />
              </Field>
              <Field label="Postcode">
                <input name="carrierPostcode" defaultValue={input.carrier.address.postcode} className={inputClass} />
              </Field>
              <div className="md:col-span-2">
                <Field label="Full address">
                  <input name="carrierFullAddress" defaultValue={input.carrier.address.fullAddress} className={inputClass} />
                </Field>
              </div>
              <Field label="Email">
                <input name="carrierEmailAddress" defaultValue={input.carrier.emailAddress ?? ""} className={inputClass} />
              </Field>
              <Field label="Phone">
                <input name="carrierPhoneNumber" defaultValue={input.carrier.phoneNumber ?? ""} className={inputClass} />
              </Field>
              <Field label="Vehicle registration">
                <input name="carrierVehicleRegistration" defaultValue={input.carrier.vehicleRegistration ?? ""} className={inputClass} />
              </Field>
              <Field label="Means of transport">
                <select name="carrierMeansOfTransport" defaultValue={input.carrier.meansOfTransport} className={inputClass}>
                  <option value="Road">Road</option>
                  <option value="Rail">Rail</option>
                  <option value="Air">Air</option>
                  <option value="Sea">Sea</option>
                  <option value="Inland Waterway">Inland Waterway</option>
                  <option value="Piped">Piped</option>
                  <option value="Other">Other</option>
                </select>
              </Field>
            </div>
          </section>

          <section className="rounded-[30px] border border-black/[0.08] bg-white p-6 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-600">Receiver</p>
            <h2 className="mt-1 text-xl font-semibold">Receiving site details</h2>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="Site name">
                <input name="receiverSiteName" defaultValue={input.receiver.siteName} className={inputClass} />
              </Field>
              <Field label="Authorisation number">
                <input name="receiverAuthorisationNumber" defaultValue={input.receiver.authorisationNumber} className={inputClass} />
              </Field>
              <Field label="Email">
                <input name="receiverEmailAddress" defaultValue={input.receiver.emailAddress ?? ""} className={inputClass} />
              </Field>
              <Field label="Phone">
                <input name="receiverPhoneNumber" defaultValue={input.receiver.phoneNumber ?? ""} className={inputClass} />
              </Field>
              <div className="md:col-span-2">
                <Field label="Receipt full address">
                  <input name="receiptFullAddress" defaultValue={input.receipt.address.fullAddress} className={inputClass} />
                </Field>
              </div>
              <Field label="Receipt postcode">
                <input name="receiptPostcode" defaultValue={input.receipt.address.postcode} className={inputClass} />
              </Field>
            </div>
          </section>

          <section className="sticky bottom-4 rounded-[28px] border border-black/10 bg-black p-4 text-white shadow-xl">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold">Save and return to the batch</p>
                <p className="mt-1 text-xs text-white/45">Nothing is submitted from this page.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href="/home/dwt/batch" className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-white">
                  Cancel
                </Link>
                <button type="submit" className="rounded-full bg-orange-500 px-6 py-2.5 text-sm font-semibold text-black">
                  Save quick fix
                </button>
              </div>
            </div>
          </section>
        </form>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold text-black/55">{label}</span>
      {children}
    </label>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-black/[0.025] px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/30">{label}</p>
      <p className="mt-1.5 text-sm font-medium text-black/65">{value}</p>
    </div>
  );
}
