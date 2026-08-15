// src/app/home/materials/[materialId]/edit/page.tsx

import Link from "next/link";

import {
  and,
  asc,
  eq,
} from "drizzle-orm";

import {
  notFound,
  redirect,
} from "next/navigation";

import { auth } from "@/auth";
import { database } from "@/db/database";

import {
  disposalRecoveryCodes,
  ewcCodes,
  materialProfiles,
  permitEwcCodes,
  sitePermits,
  users,
} from "@/db/schema";

import {
  updateMaterialProfileAction,
} from "../../actions";

/* =========================================================
   HELPERS
========================================================= */

function firstParam(
  value: string | string[] | undefined,
) {
  return Array.isArray(value)
    ? value[0] ?? ""
    : value ?? "";
}

function formatEwcCode(
  code: string,
) {
  if (code.length !== 6) {
    return code;
  }

  return `${code.slice(
    0,
    2,
  )} ${code.slice(
    2,
    4,
  )} ${code.slice(4, 6)}`;
}

function errorMessage(
  key: string,
) {
  const map: Record<
    string,
    string
  > = {
    name_required:
      "Enter a material profile name.",

    invalid_ewc:
      "Choose a valid six-digit EWC code.",

    description_required:
      "Enter a waste description.",

    invalid_container_count:
      "Container count must be zero or greater.",

    container_type_required:
      "Enter a container type.",

    dr_code_required:
      "Choose a D/R code.",

    active_permit_required:
      "The receiving site needs an active permit.",

    ewc_not_permitted:
      "That EWC is not currently configured against the active permit.",

    invalid_dr_code:
      "Choose a valid D/R code.",

    duplicate_name:
      "Another profile already uses that name.",

    pops_components_required:
      "POP components are required for Guidance or Own Testing.",

    hazardous_components_required:
      "Hazardous components are required for Guidance or Own Testing.",
  };

  return (
    map[key] ??
    "Something went wrong."
  );
}

/* =========================================================
   PAGE
========================================================= */

export default async function EditMaterialPage({
  params,
  searchParams,
}: {
  params: {
    materialId: string;
  };

  searchParams: {
    error?: string | string[];
  };
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const currentUser =
    await database.query.users.findFirst({
      where: eq(
        users.id,
        session.user.id,
      ),

      columns: {
        organisationId: true,
        role: true,
      },
    });

  if (
    !currentUser?.organisationId ||
    (
      currentUser.role !==
        "administrator" &&
      currentUser.role !==
        "seniorManagement"
    )
  ) {
    redirect("/home/materials");
  }

  const profile =
    await database.query.materialProfiles.findFirst({
      where: and(
        eq(
          materialProfiles.id,
          params.materialId,
        ),
        eq(
          materialProfiles.organisationId,
          currentUser.organisationId,
        ),
      ),
    });

  if (!profile) {
    notFound();
  }

  if (!profile.siteId) {
    redirect(
      `/home/materials/${profile.id}?error=no_site`,
    );
  }

  const permit =
    await database.query.sitePermits.findFirst({
      where: and(
        eq(
          sitePermits.organisationId,
          currentUser.organisationId,
        ),
        eq(
          sitePermits.siteId,
          profile.siteId,
        ),
        eq(
          sitePermits.isPrimary,
          true,
        ),
        eq(
          sitePermits.status,
          "active",
        ),
      ),
    });

  const permittedEwc =
    permit
      ? await database
          .select({
            code: ewcCodes.code,
            description:
              ewcCodes.description,
            isHazardous:
              ewcCodes.isHazardous,
          })
          .from(permitEwcCodes)
          .innerJoin(
            ewcCodes,
            eq(
              permitEwcCodes.ewcCodeId,
              ewcCodes.id,
            ),
          )
          .where(
            and(
              eq(
                permitEwcCodes.permitId,
                permit.id,
              ),
              eq(
                permitEwcCodes.isActive,
                true,
              ),
            ),
          )
          .orderBy(
            asc(ewcCodes.code),
          )
      : [];

  const currentEwc =
    await database.query.ewcCodes.findFirst({
      where: eq(
        ewcCodes.id,
        profile.ewcCodeId,
      ),
    });

  const currentDr =
    profile.defaultDisposalRecoveryCodeId
      ? await database.query.disposalRecoveryCodes.findFirst({
          where: eq(
            disposalRecoveryCodes.id,
            profile.defaultDisposalRecoveryCodeId,
          ),
        })
      : null;

  const drCodes =
    await database
      .select()
      .from(
        disposalRecoveryCodes,
      )
      .where(
        eq(
          disposalRecoveryCodes.isActive,
          true,
        ),
      )
      .orderBy(
        asc(
          disposalRecoveryCodes.code,
        ),
      );

  const error =
    firstParam(
      searchParams.error,
    );

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-8 py-32 pl-[24vw]">
      <div className="mx-auto max-w-6xl space-y-7">

        <section className="rounded-[2rem] bg-black p-8 text-white">
          <Link
            href={`/home/materials/${profile.id}`}
            className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-400"
          >
            ← Material Profile
          </Link>

          <h1 className="mt-5 text-4xl font-semibold">
            Edit {profile.name}
          </h1>
        </section>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-800">
            {errorMessage(error)}
          </div>
        )}

        {!permit ? (
          <section className="rounded-[2rem] border border-red-200 bg-red-50 p-7">
            The receiving facility does
            not currently have an active
            primary permit configured.
          </section>
        ) : (
          <form
            action={
              updateMaterialProfileAction
            }
            className="space-y-7"
          >
            <input
              type="hidden"
              name="materialId"
              value={profile.id}
            />

            <Card title="Material">
              <div className="grid gap-5 md:grid-cols-2">
                <Field
                  label="Profile name"
                  name="name"
                  defaultValue={
                    profile.name
                  }
                  required
                />

                <label>
                  <Label>
                    Permitted EWC
                  </Label>

                  <input
                    name="ewcCode"
                    list="permitted-ewc-edit"
                    defaultValue={
                      currentEwc
                        ? formatEwcCode(
                            currentEwc.code,
                          )
                        : ""
                    }
                    required
                    className={inputClass}
                  />

                  <datalist id="permitted-ewc-edit">
                    {permittedEwc.map(
                      (ewc) => (
                        <option
                          key={
                            ewc.code
                          }
                          value={formatEwcCode(
                            ewc.code,
                          )}
                        >
                          {
                            ewc.description
                          }
                        </option>
                      ),
                    )}
                  </datalist>
                </label>

                <div className="md:col-span-2">
                  <TextArea
                    label="Waste description"
                    name="wasteDescription"
                    defaultValue={
                      profile.wasteDescription
                    }
                    required
                  />
                </div>
              </div>
            </Card>

            <Card title="Physical & Containers">
              <div className="grid gap-5 md:grid-cols-3">
                <Select
                  label="Physical form"
                  name="physicalForm"
                  defaultValue={
                    profile.physicalForm
                  }
                  options={[
                    "Gas",
                    "Liquid",
                    "Solid",
                    "Powder",
                    "Sludge",
                    "Mixed",
                  ]}
                />

                <Field
                  label="Containers"
                  name="defaultNumberOfContainers"
                  type="number"
                  min="0"
                  defaultValue={String(
                    profile.defaultNumberOfContainers,
                  )}
                  required
                />

                <Field
                  label="Container code"
                  name="defaultContainerType"
                  defaultValue={
                    profile.defaultContainerType
                  }
                  required
                />
              </div>
            </Card>

            <Card title="Treatment">
              <div className="grid gap-5 md:grid-cols-2">
                <label>
                  <Label>
                    D/R code
                  </Label>

                  <input
                    name="defaultDisposalRecoveryCode"
                    list="dr-edit"
                    defaultValue={
                      currentDr?.code ??
                      ""
                    }
                    required
                    className={inputClass}
                  />

                  <datalist id="dr-edit">
                    {drCodes.map(
                      (code) => (
                        <option
                          key={
                            code.id
                          }
                          value={
                            code.code
                          }
                        >
                          {
                            code.description
                          }
                        </option>
                      ),
                    )}
                  </datalist>
                </label>

                <Select
                  label="Weight unit"
                  name="defaultWeightMetric"
                  defaultValue={
                    profile.defaultWeightMetric
                  }
                  options={[
                    "Tonnes",
                    "Kilograms",
                    "Grams",
                  ]}
                />
              </div>
            </Card>

            <Card title="POPs">
              <Checkbox
                name="containsPops"
                label="Contains POPs"
                defaultChecked={
                  profile.containsPops
                }
              />

              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <SourceSelect
                  name="popsSourceOfComponents"
                  label="Source"
                  defaultValue={
                    profile.popsSourceOfComponents ??
                    "NOT_PROVIDED"
                  }
                />

                <Field
                  label="Components"
                  name="popsComponents"
                  defaultValue={
                    profile.popsComponents ??
                    ""
                  }
                />
              </div>
            </Card>

            <Card title="Hazardous Information">
              <div className="grid gap-5 md:grid-cols-3">
                <SourceSelect
                  name="hazardousSourceOfComponents"
                  label="Source"
                  defaultValue={
                    profile.hazardousSourceOfComponents ??
                    "NOT_PROVIDED"
                  }
                />

                <Field
                  label="Haz codes"
                  name="hazardousHazCodes"
                  defaultValue={
                    profile.hazardousHazCodes ??
                    ""
                  }
                />

                <Field
                  label="Components"
                  name="hazardousComponents"
                  defaultValue={
                    profile.hazardousComponents ??
                    ""
                  }
                />
              </div>
            </Card>

            <Card title="Workspace">
              <Checkbox
                name="isFavourite"
                label="Favourite"
                defaultChecked={
                  profile.isFavourite
                }
              />

              <div className="mt-5">
                <TextArea
                  label="Internal notes"
                  name="notes"
                  defaultValue={
                    profile.notes ??
                    ""
                  }
                />
              </div>
            </Card>

            <div className="flex justify-end gap-3">
              <Link
                href={`/home/materials/${profile.id}`}
                className="rounded-2xl border border-black/10 bg-white px-6 py-3 text-sm font-semibold"
              >
                Cancel
              </Link>

              <button
                type="submit"
                className="rounded-2xl bg-orange-500 px-7 py-3 text-sm font-semibold text-black"
              >
                Save Changes
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}

/* =========================================================
   STYLE
========================================================= */

const inputClass =
  "h-12 w-full rounded-2xl border border-black/10 bg-[#faf8f4] px-4 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100";

/* =========================================================
   COMPONENTS
========================================================= */

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[2rem] border border-black/10 bg-white p-7 shadow-sm">
      <h2 className="text-xl font-semibold">
        {title}
      </h2>

      <div className="mt-6">
        {children}
      </div>
    </section>
  );
}

function Label({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em] text-black/40">
      {children}
    </span>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  required = false,
  min,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
  required?: boolean;
  min?: string;
}) {
  return (
    <label>
      <Label>{label}</Label>

      <input
        type={type}
        name={name}
        defaultValue={
          defaultValue
        }
        required={required}
        min={min}
        className={inputClass}
      />
    </label>
  );
}

function TextArea({
  label,
  name,
  defaultValue,
  required = false,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <label>
      <Label>{label}</Label>

      <textarea
        name={name}
        defaultValue={
          defaultValue
        }
        required={required}
        rows={4}
        className="w-full rounded-2xl border border-black/10 bg-[#faf8f4] px-4 py-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
      />
    </label>
  );
}

function Select({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue: string;
  options: string[];
}) {
  return (
    <label>
      <Label>{label}</Label>

      <select
        name={name}
        defaultValue={
          defaultValue
        }
        className={inputClass}
      >
        {options.map(
          (option) => (
            <option
              key={option}
              value={option}
            >
              {option}
            </option>
          ),
        )}
      </select>
    </label>
  );
}

function SourceSelect({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue: string;
}) {
  return (
    <Select
      label={label}
      name={name}
      defaultValue={
        defaultValue
      }
      options={[
        "NOT_PROVIDED",
        "PROVIDED_WITH_WASTE",
        "GUIDANCE",
        "OWN_TESTING",
      ]}
    />
  );
}

function Checkbox({
  name,
  label,
  defaultChecked = false,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex items-center gap-3 rounded-2xl bg-[#faf8f4] p-4">
      <input
        type="checkbox"
        name={name}
        defaultChecked={
          defaultChecked
        }
        className="h-4 w-4 accent-orange-500"
      />

      <span className="text-sm font-medium text-black/65">
        {label}
      </span>
    </label>
  );
}