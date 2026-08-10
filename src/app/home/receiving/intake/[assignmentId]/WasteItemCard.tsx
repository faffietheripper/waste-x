// src/app/home/receiving/intake/[assignmentId]/WasteItemCard.tsx

"use client";

import type { ReactNode } from "react";

import {
  PHYSICAL_FORMS,
  SOURCE_OF_COMPONENTS,
  WEIGHT_METRICS,
  type PhysicalForm,
  type SourceOfComponents,
  type WeightMetric,
} from "@/modules/digital-waste-tracking/types/receiveMovement.types";

import {
  createDisposalRecoveryCode,
  createHazardousComponent,
  createPopsComponent,
  type DisposalRecoveryFormState,
  type HazardousComponentFormState,
  type PopsComponentFormState,
  type WasteItemFormState,
} from "./receiveMovementFormTypes";

type Props = {
  item: WasteItemFormState;
  index: number;
  canRemove: boolean;
  onChange: (item: WasteItemFormState) => void;
  onRemove: () => void;
  issueMessagesFor: (keys: string[]) => string[];
  inputClassFor: (keys: string[]) => string;
};

const SOURCE_LABELS: Record<SourceOfComponents, string> = {
  NOT_PROVIDED: "Not provided",
  PROVIDED_WITH_WASTE: "Provided with the waste",
  GUIDANCE: "Based on guidance",
  OWN_TESTING: "From own testing or lab results",
};

export default function WasteItemCard({
  item,
  index,
  canRemove,
  onChange,
  onRemove,
  issueMessagesFor,
  inputClassFor,
}: Props) {
  const prefix = `wasteItems[${index}]`;

  function update(patch: Partial<WasteItemFormState>) {
    onChange({
      ...item,
      ...patch,
    });
  }

  function updateDisposalCode(
    rowId: string,
    patch: Partial<DisposalRecoveryFormState>,
  ) {
    update({
      disposalOrRecoveryCodes: item.disposalOrRecoveryCodes.map((row) =>
        row.id === rowId ? { ...row, ...patch } : row,
      ),
    });
  }

  function removeDisposalCode(rowId: string) {
    update({
      disposalOrRecoveryCodes: item.disposalOrRecoveryCodes.filter(
        (row) => row.id !== rowId,
      ),
    });
  }

  function updatePopsComponent(
    rowId: string,
    patch: Partial<PopsComponentFormState>,
  ) {
    update({
      popsComponents: item.popsComponents.map((row) =>
        row.id === rowId ? { ...row, ...patch } : row,
      ),
    });
  }

  function removePopsComponent(rowId: string) {
    update({
      popsComponents: item.popsComponents.filter((row) => row.id !== rowId),
    });
  }

  function updateHazardousComponent(
    rowId: string,
    patch: Partial<HazardousComponentFormState>,
  ) {
    update({
      hazardousComponents: item.hazardousComponents.map((row) =>
        row.id === rowId ? { ...row, ...patch } : row,
      ),
    });
  }

  function removeHazardousComponent(rowId: string) {
    update({
      hazardousComponents: item.hazardousComponents.filter(
        (row) => row.id !== rowId,
      ),
    });
  }

  return (
    <section className="rounded-3xl border border-black/10 bg-white p-5">
      <div className="flex flex-col gap-3 border-b border-black/10 pb-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-600">
            Waste item {index + 1}
          </p>

          <h4 className="mt-1 text-base font-semibold text-black">
            Waste received
          </h4>
        </div>

        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
          >
            Remove item
          </button>
        )}
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Field
          label="Waste code / EWC code"
          required
          helper="Separate multiple codes with commas. Example: 170904, 170802"
          error={issueMessagesFor([`${prefix}.ewcCodes`])}
        >
          <input
            value={item.ewcCodes}
            onChange={(event) => update({ ewcCodes: event.target.value })}
            className={inputClassFor([`${prefix}.ewcCodes`])}
            placeholder="Example: 170904"
          />
        </Field>

        <Field
          label="Waste description"
          required
          error={issueMessagesFor([`${prefix}.wasteDescription`])}
        >
          <textarea
            value={item.wasteDescription}
            onChange={(event) =>
              update({ wasteDescription: event.target.value })
            }
            className={`${inputClassFor([
              `${prefix}.wasteDescription`,
            ])} min-h-24`}
            placeholder="Describe the waste received"
          />
        </Field>

        <Field
          label="Physical form"
          required
          error={issueMessagesFor([`${prefix}.physicalForm`])}
        >
          <select
            value={item.physicalForm}
            onChange={(event) =>
              update({ physicalForm: event.target.value as PhysicalForm })
            }
            className={inputClassFor([`${prefix}.physicalForm`])}
          >
            {PHYSICAL_FORMS.map((form) => (
              <option key={form} value={form}>
                {form}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Container type"
          required
          helper="Use the container type recorded for the received waste. Example: SKI for skip, BAG for bag."
          error={issueMessagesFor([`${prefix}.typeOfContainers`])}
        >
          <input
            value={item.typeOfContainers}
            onChange={(event) =>
              update({ typeOfContainers: event.target.value })
            }
            className={inputClassFor([`${prefix}.typeOfContainers`])}
            placeholder="Example: SKI"
          />
        </Field>

        <Field
          label="Number of containers"
          required
          error={issueMessagesFor([`${prefix}.numberOfContainers`])}
        >
          <input
            type="number"
            min="0"
            value={item.numberOfContainers}
            onChange={(event) =>
              update({ numberOfContainers: event.target.value })
            }
            className={inputClassFor([`${prefix}.numberOfContainers`])}
          />
        </Field>

        <Field
          label="Weight amount"
          required
          error={issueMessagesFor([`${prefix}.weight.amount`])}
        >
          <input
            type="number"
            min="0"
            step="0.001"
            value={item.weightAmount}
            onChange={(event) => update({ weightAmount: event.target.value })}
            className={inputClassFor([`${prefix}.weight.amount`])}
            placeholder="Example: 1.250"
          />
        </Field>

        <Field
          label="Weight metric"
          required
          error={issueMessagesFor([`${prefix}.weight.metric`])}
        >
          <select
            value={item.weightMetric}
            onChange={(event) =>
              update({ weightMetric: event.target.value as WeightMetric })
            }
            className={inputClassFor([`${prefix}.weight.metric`])}
          >
            {WEIGHT_METRICS.map((metric) => (
              <option key={metric} value={metric}>
                {metric}
              </option>
            ))}
          </select>
        </Field>

        <ToggleField
          label="Is this weight estimated?"
          checked={item.weightIsEstimate}
          onChange={(value) => update({ weightIsEstimate: value })}
        />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <ToggleField
          label="Does this waste contain POPs?"
          checked={item.containsPops}
          onChange={(value) => {
            update({
              containsPops: value,
              popsSourceOfComponents: value
                ? item.popsSourceOfComponents
                : "NOT_PROVIDED",
              popsComponents: value
                ? item.popsComponents.length > 0
                  ? item.popsComponents
                  : [createPopsComponent()]
                : [],
            });
          }}
        />

        <ToggleField
          label="Is this hazardous waste?"
          checked={item.containsHazardous}
          onChange={(value) => {
            update({
              containsHazardous: value,
              hazardousSourceOfComponents: value
                ? item.hazardousSourceOfComponents
                : "NOT_PROVIDED",
              hazCodes: value ? item.hazCodes : "",
              hazardousComponents: value
                ? item.hazardousComponents.length > 0
                  ? item.hazardousComponents
                  : [createHazardousComponent()]
                : [],
            });
          }}
        />
      </div>

      {item.containsPops && (
        <div className="mt-6 rounded-3xl border border-orange-200 bg-orange-50 p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h5 className="text-sm font-semibold text-orange-900">
                POPs details
              </h5>
              <p className="mt-1 text-sm leading-6 text-orange-800/70">
                Add the POP components known for this waste item.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                update({
                  popsComponents: [
                    ...item.popsComponents,
                    createPopsComponent(),
                  ],
                })
              }
              className="rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-orange-400"
            >
              Add POP component
            </button>
          </div>

          <div className="mt-4 grid gap-4">
            <Field
              label="How were the POPs identified?"
              required
              error={issueMessagesFor([`${prefix}.pops.sourceOfComponents`])}
            >
              <select
                value={item.popsSourceOfComponents}
                onChange={(event) =>
                  update({
                    popsSourceOfComponents: event.target
                      .value as SourceOfComponents,
                  })
                }
                className={inputClassFor([`${prefix}.pops.sourceOfComponents`])}
              >
                {SOURCE_OF_COMPONENTS.map((source) => (
                  <option key={source} value={source}>
                    {SOURCE_LABELS[source]}
                  </option>
                ))}
              </select>
            </Field>

            {item.popsComponents.map((component, componentIndex) => {
              const componentPrefix = `${prefix}.pops.components[${componentIndex}]`;

              return (
                <div
                  key={component.id}
                  className="grid gap-4 rounded-2xl border border-orange-200 bg-white p-4 md:grid-cols-[1fr_1fr_auto]"
                >
                  <Field
                    label={`POP code ${componentIndex + 1}`}
                    required
                    error={issueMessagesFor([`${componentPrefix}.code`])}
                  >
                    <input
                      value={component.code}
                      onChange={(event) =>
                        updatePopsComponent(component.id, {
                          code: event.target.value,
                        })
                      }
                      className={inputClassFor([`${componentPrefix}.code`])}
                      placeholder="Example: PFHXS"
                    />
                  </Field>

                  <Field
                    label="Concentration"
                    helper="Optional. Add concentration if known."
                    error={issueMessagesFor([
                      `${componentPrefix}.concentration`,
                    ])}
                  >
                    <input
                      type="number"
                      step="0.001"
                      value={component.concentration}
                      onChange={(event) =>
                        updatePopsComponent(component.id, {
                          concentration: event.target.value,
                        })
                      }
                      className={inputClassFor([
                        `${componentPrefix}.concentration`,
                      ])}
                      placeholder="Example: 12.500"
                    />
                  </Field>

                  <button
                    type="button"
                    onClick={() => removePopsComponent(component.id)}
                    className="self-end rounded-full border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-100"
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {item.containsHazardous && (
        <div className="mt-6 rounded-3xl border border-red-200 bg-red-50 p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h5 className="text-sm font-semibold text-red-900">
                Hazardous waste details
              </h5>
              <p className="mt-1 text-sm leading-6 text-red-800/70">
                Add the hazardous property codes and components recorded for
                this waste item.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                update({
                  hazardousComponents: [
                    ...item.hazardousComponents,
                    createHazardousComponent(),
                  ],
                })
              }
              className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
            >
              Add hazardous component
            </button>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field
              label="How were the hazardous details identified?"
              required
              error={issueMessagesFor([
                `${prefix}.hazardous.sourceOfComponents`,
              ])}
            >
              <select
                value={item.hazardousSourceOfComponents}
                onChange={(event) =>
                  update({
                    hazardousSourceOfComponents: event.target
                      .value as SourceOfComponents,
                  })
                }
                className={inputClassFor([
                  `${prefix}.hazardous.sourceOfComponents`,
                ])}
              >
                {SOURCE_OF_COMPONENTS.map((source) => (
                  <option key={source} value={source}>
                    {SOURCE_LABELS[source]}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Hazardous property codes"
              required
              helper="Separate multiple codes with commas. Example: HP_5, HP_14"
              error={issueMessagesFor([`${prefix}.hazardous.hazCodes`])}
            >
              <input
                value={item.hazCodes}
                onChange={(event) => update({ hazCodes: event.target.value })}
                className={inputClassFor([`${prefix}.hazardous.hazCodes`])}
                placeholder="Example: HP_5, HP_14"
              />
            </Field>
          </div>

          <div className="mt-4 grid gap-4">
            {item.hazardousComponents.map((component, componentIndex) => {
              const componentPrefix = `${prefix}.hazardous.components[${componentIndex}]`;

              return (
                <div
                  key={component.id}
                  className="grid gap-4 rounded-2xl border border-red-200 bg-white p-4 md:grid-cols-[1fr_1fr_auto]"
                >
                  <Field
                    label={`Hazardous component ${componentIndex + 1}`}
                    required
                    error={issueMessagesFor([`${componentPrefix}.name`])}
                  >
                    <input
                      value={component.name}
                      onChange={(event) =>
                        updateHazardousComponent(component.id, {
                          name: event.target.value,
                        })
                      }
                      className={inputClassFor([`${componentPrefix}.name`])}
                      placeholder="Example: mineral fibres"
                    />
                  </Field>

                  <Field
                    label="Concentration"
                    helper="Optional. Add concentration if known."
                    error={issueMessagesFor([
                      `${componentPrefix}.concentration`,
                    ])}
                  >
                    <input
                      type="number"
                      step="0.001"
                      value={component.concentration}
                      onChange={(event) =>
                        updateHazardousComponent(component.id, {
                          concentration: event.target.value,
                        })
                      }
                      className={inputClassFor([
                        `${componentPrefix}.concentration`,
                      ])}
                      placeholder="Example: 18.500"
                    />
                  </Field>

                  <button
                    type="button"
                    onClick={() => removeHazardousComponent(component.id)}
                    className="self-end rounded-full border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-100"
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-6 rounded-3xl border border-black/10 bg-[#f7f3ed] p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h5 className="text-sm font-semibold text-black">
              Treatment, disposal or recovery codes
            </h5>

            <p className="mt-1 text-sm leading-6 text-black/50">
              Add these codes if they are known or required for this received
              waste. Leave blank if no treatment, disposal or recovery code is
              being recorded for this item.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              update({
                disposalOrRecoveryCodes: [
                  ...item.disposalOrRecoveryCodes,
                  createDisposalRecoveryCode(),
                ],
              })
            }
            className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-black/80"
          >
            Add code
          </button>
        </div>

        <div className="mt-4 grid gap-4">
          {item.disposalOrRecoveryCodes.length === 0 && (
            <div className="rounded-2xl border border-dashed border-black/15 bg-white px-4 py-5 text-sm text-black/45">
              No treatment, disposal or recovery codes added.
            </div>
          )}

          {item.disposalOrRecoveryCodes.map((row, rowIndex) => {
            const rowPrefix = `${prefix}.disposalOrRecoveryCodes[${rowIndex}]`;

            return (
              <div
                key={row.id}
                className="grid gap-4 rounded-2xl border border-black/10 bg-white p-4 md:grid-cols-[1fr_1fr_1fr_auto_auto]"
              >
                <Field
                  label="Code"
                  error={issueMessagesFor([`${rowPrefix}.code`])}
                >
                  <input
                    value={row.code}
                    onChange={(event) =>
                      updateDisposalCode(row.id, {
                        code: event.target.value,
                      })
                    }
                    className={inputClassFor([`${rowPrefix}.code`])}
                    placeholder="Example: R5"
                  />
                </Field>

                <Field
                  label="Weight"
                  error={issueMessagesFor([`${rowPrefix}.weight.amount`])}
                >
                  <input
                    type="number"
                    step="0.001"
                    value={row.weightAmount}
                    onChange={(event) =>
                      updateDisposalCode(row.id, {
                        weightAmount: event.target.value,
                      })
                    }
                    className={inputClassFor([`${rowPrefix}.weight.amount`])}
                    placeholder="Example: 0.900"
                  />
                </Field>

                <Field
                  label="Metric"
                  error={issueMessagesFor([`${rowPrefix}.weight.metric`])}
                >
                  <select
                    value={row.weightMetric}
                    onChange={(event) =>
                      updateDisposalCode(row.id, {
                        weightMetric: event.target.value as WeightMetric,
                      })
                    }
                    className={inputClassFor([`${rowPrefix}.weight.metric`])}
                  >
                    {WEIGHT_METRICS.map((metric) => (
                      <option key={metric} value={metric}>
                        {metric}
                      </option>
                    ))}
                  </select>
                </Field>

                <div className="self-end">
                  <ToggleMini
                    label="Estimate"
                    checked={row.weightIsEstimate}
                    onChange={(value) =>
                      updateDisposalCode(row.id, {
                        weightIsEstimate: value,
                      })
                    }
                  />
                </div>

                <button
                  type="button"
                  onClick={() => removeDisposalCode(row.id)}
                  className="self-end rounded-full border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-100"
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      </div>
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

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex min-h-[48px] items-center justify-between rounded-2xl border border-black/10 bg-white px-4 py-3">
      <span className="text-sm font-medium text-black/60">{label}</span>

      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition ${
          checked ? "bg-orange-500" : "bg-black/15"
        }`}
      >
        <span
          className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${
            checked ? "left-6" : "left-1"
          }`}
        />
      </button>
    </label>
  );
}

function ToggleMini({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`rounded-full px-4 py-3 text-sm font-semibold transition ${
        checked
          ? "bg-orange-500 text-black"
          : "border border-black/10 bg-white text-black/50"
      }`}
    >
      {label}: {checked ? "Yes" : "No"}
    </button>
  );
}