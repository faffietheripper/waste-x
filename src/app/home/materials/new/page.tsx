// src/app/home/materials/new/page.tsx

import Link from "next/link";
import { redirect } from "next/navigation";

import {
  and,
  asc,
  desc,
  eq,
} from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";

import {
  disposalRecoveryCodes,
  ewcCodes,
  permitEwcCodes,
  sitePermits,
  sites,
  users,
} from "@/db/schema";

import {
  createMaterialProfileAction,
} from "../actions";

/* =========================================================
   TYPES
========================================================= */

type SearchParams = {
  error?: string | string[];
};

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
  const messages: Record<
    string,
    string
  > = {
    name_required:
      "Enter a material profile name.",

    invalid_ewc:
      "Choose a valid six-digit EWC code.",

    description_required:
      "Enter a detailed waste description.",

    invalid_container_count:
      "Container count must be zero or greater.",

    container_type_required:
      "Enter the normal container type code.",

    dr_code_required:
      "Choose a default disposal or recovery code.",

    receiving_site_required:
      "Configure your receiving site first.",

    active_permit_required:
      "Configure an active environmental permit first.",

    ewc_not_permitted:
      "That EWC code is not configured against the receiving site's permit.",

    invalid_dr_code:
      "Choose a valid disposal or recovery code.",

    duplicate_name:
      "A material profile with that name already exists.",

    pops_components_required:
      "POP component information is required when the source is Guidance or Own Testing.",

    hazardous_components_required:
      "Hazardous component information is required when the source is Guidance or Own Testing.",

    create_failed:
      "Waste X could not create the material profile.",
  };

  return (
    messages[key] ??
    "Something went wrong."
  );
}

/* =========================================================
   PAGE
========================================================= */

export default async function NewMaterialPage({
  searchParams,
}: {
  searchParams: SearchParams;
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
        id: true,
        organisationId: true,
        role: true,
      },
    });

  if (!currentUser?.organisationId) {
    redirect(
      "/home/settings/organisation",
    );
  }

  if (
    currentUser.role !== "administrator" &&
    currentUser.role !== "seniorManagement"
  ) {
    redirect(
      "/home/materials?error=unauthorised",
    );
  }

  const organisationId =
    currentUser.organisationId;

  const error =
    firstParam(
      searchParams.error,
    );

  /* =======================================================
     RECEIVING SITE
  ======================================================= */

  const receivingSite =
    await database.query.sites.findFirst({
      where: and(
        eq(
          sites.organisationId,
          organisationId,
        ),
        eq(
          sites.isDefault,
          true,
        ),
        eq(
          sites.status,
          "active",
        ),
      ),
    });

  /* =======================================================
     PERMIT
  ======================================================= */

  const permit =
    receivingSite
      ? await database.query.sitePermits.findFirst({
          where: and(
            eq(
              sitePermits.organisationId,
              organisationId,
            ),
            eq(
              sitePermits.siteId,
              receivingSite.id,
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
        })
      : null;

  /* =======================================================
     PERMITTED EWC
  ======================================================= */

  const permittedEwc =
    permit
      ? await database
          .select({
            id: ewcCodes.id,
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
              eq(
                ewcCodes.isActive,
                true,
              ),
            ),
          )
          .orderBy(
            asc(ewcCodes.code),
          )
      : [];

  /* =======================================================
     D/R
  ======================================================= */

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
          disposalRecoveryCodes.type,
        ),
        asc(
          disposalRecoveryCodes.code,
        ),
      );

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-8 py-32 pl-[24vw]">
      <div className="mx-auto max-w-6xl space-y-7">

        {/* =================================================
            HEADER
        ================================================= */}

        <section className="relative overflow-hidden rounded-[2rem] bg-black p-8 text-white">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-orange-500/20 blur-3xl" />

          <div className="relative">
            <Link
              href="/home/materials"
              className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-400"
            >
              ← Materials
            </Link>

            <h1 className="mt-5 text-4xl font-semibold">
              New Material Profile
            </h1>

            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
              Store the repeated waste
              information once so jobs,
              loads and DWT records can
              reuse it.
            </p>
          </div>
        </section>

        {error && (
          <Message>
            {errorMessage(error)}
          </Message>
        )}

        {/* =================================================
            REQUIRE SITE/PERMIT
        ================================================= */}

        {!receivingSite ||
        !permit ? (
          <section className="rounded-[2rem] border border-orange-200 bg-orange-50 p-8">
            <h2 className="text-xl font-semibold text-black">
              Receiving-site setup
              required
            </h2>

            <p className="mt-3 text-sm leading-6 text-black/55">
              Waste X needs the
              facility and its active
              environmental
              authorisation before
              creating receiving
              Material Profiles.
            </p>

            <Link
              href="/home/sites"
              className="mt-6 inline-flex rounded-2xl bg-black px-6 py-3 text-sm font-semibold text-orange-400"
            >
              Configure Site & Permit
            </Link>
          </section>
        ) : permittedEwc.length ===
          0 ? (
          <section className="rounded-[2rem] border border-orange-200 bg-orange-50 p-8">
            <h2 className="text-xl font-semibold">
              Add permitted EWC codes
              first
            </h2>

            <p className="mt-3 text-sm text-black/55">
              The permit currently has
              no active EWC codes
              configured in Waste X.
            </p>

            <Link
              href={`/home/sites/${receivingSite.id}#accepted-ewc`}
              className="mt-6 inline-flex rounded-2xl bg-black px-6 py-3 text-sm font-semibold text-orange-400"
            >
              Configure Permitted EWC
            </Link>
          </section>
        ) : (
          <form
            action={
              createMaterialProfileAction
            }
            className="space-y-7"
          >
            {/* ===============================================
                BASIC PROFILE
            =============================================== */}

            <Card
              eyebrow="Profile"
              title="Material"
              description="What your team should recognise and select during normal operations."
            >
              <div className="grid gap-5 lg:grid-cols-2">
                <Field
                  label="Material profile name"
                  name="name"
                  placeholder="Mixed Construction Waste"
                  required
                />

                <label>
                  <Label>
                    Permitted EWC Code
                  </Label>

                  <input
                    name="ewcCode"
                    list="permitted-ewc"
                    placeholder="17 09 04"
                    required
                    className={inputClass}
                  />

                  <datalist id="permitted-ewc">
                    {permittedEwc.map(
                      (ewc) => (
                        <option
                          key={
                            ewc.id
                          }
                          value={formatEwcCode(
                            ewc.code,
                          )}
                        >
                          {
                            ewc.description
                          }
                          {ewc.isHazardous
                            ? " — HAZARDOUS"
                            : ""}
                        </option>
                      ),
                    )}
                  </datalist>

                  <p className="mt-2 text-xs text-black/35">
                    Only EWC codes
                    configured against{" "}
                    {
                      permit.permitNumber
                    }{" "}
                    can be saved.
                  </p>
                </label>

                <div className="lg:col-span-2">
                  <TextArea
                    label="Detailed waste description"
                    name="wasteDescription"
                    placeholder="Mixed non-hazardous construction and demolition waste consisting of..."
                    required
                  />
                </div>
              </div>
            </Card>

            {/* ===============================================
                PHYSICAL / CONTAINERS
            =============================================== */}

            <Card
              eyebrow="DWT defaults"
              title="Physical & Container Details"
              description="Normal values Waste X can pre-fill when this material is selected."
            >
              <div className="grid gap-5 md:grid-cols-3">
                <SelectField
                  label="Physical form"
                  name="physicalForm"
                  defaultValue="Solid"
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
                  label="Default number of containers"
                  name="defaultNumberOfContainers"
                  type="number"
                  defaultValue="1"
                  min="0"
                  required
                />

                <label>
                  <Label>
                    Container type code
                  </Label>

                  <input
                    name="defaultContainerType"
                    list="container-types"
                    placeholder="SKI"
                    required
                    className={inputClass}
                  />

                  <datalist id="container-types">
                    <option value="BAG">
                      Bag / Sack
                    </option>

                    <option value="BAL">
                      Bale
                    </option>

                    <option value="BOX">
                      Box / Carton /
                      Crate
                    </option>

                    <option value="DRU">
                      Drum
                    </option>

                    <option value="SKI">
                      Skip
                    </option>

                    <option value="WBI">
                      Wheelie Bin
                    </option>
                  </datalist>

                  <p className="mt-2 text-xs text-black/35">
                    Use the Defra
                    container code.
                  </p>
                </label>
              </div>
            </Card>

            {/* ===============================================
                TREATMENT
            =============================================== */}

            <Card
              eyebrow="Treatment"
              title="Disposal / Recovery"
              description="The normal treatment route. The actual load can override this later."
            >
              <div className="grid gap-5 md:grid-cols-2">
                <label>
                  <Label>
                    Default D/R code
                  </Label>

                  <input
                    name="defaultDisposalRecoveryCode"
                    list="dr-codes"
                    placeholder="R5"
                    required
                    className={inputClass}
                  />

                  <datalist id="dr-codes">
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

                <SelectField
                  label="Default weight unit"
                  name="defaultWeightMetric"
                  defaultValue="Tonnes"
                  options={[
                    "Tonnes",
                    "Kilograms",
                    "Grams",
                  ]}
                />
              </div>
            </Card>

            {/* ===============================================
                POPS
            =============================================== */}

            <Card
              eyebrow="Classification"
              title="Persistent Organic Pollutants"
              description="POPs can exist in hazardous or non-hazardous waste."
            >
              <Checkbox
                name="containsPops"
                label="This material normally contains POPs"
              />

              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <SourceSelect
                  label="POP information source"
                  name="popsSourceOfComponents"
                />

                <Field
                  label="POP components"
                  name="popsComponents"
                  placeholder="e.g. PCB, DDT..."
                />
              </div>
            </Card>

            {/* ===============================================
                HAZARDOUS
            =============================================== */}

            <Card
              eyebrow="Classification"
              title="Hazardous Information"
              description="Hazardous status itself is derived from the selected EWC catalogue record."
            >
              <div className="grid gap-5 md:grid-cols-3">
                <SourceSelect
                  label="Component source"
                  name="hazardousSourceOfComponents"
                />

                <Field
                  label="Hazardous property codes"
                  name="hazardousHazCodes"
                  placeholder="HP_5, HP_6"
                />

                <Field
                  label="Components"
                  name="hazardousComponents"
                  placeholder="Mercury, arsenic..."
                />
              </div>
            </Card>

            {/* ===============================================
                WORKSPACE
            =============================================== */}

            <Card
              eyebrow="Workspace"
              title="Reuse"
              description="Make frequent materials quicker to select."
            >
              <Checkbox
                name="isFavourite"
                label="Favourite this material"
              />

              <div className="mt-5">
                <TextArea
                  label="Internal notes"
                  name="notes"
                  placeholder="Optional notes for your team..."
                />
              </div>
            </Card>

            {/* ===============================================
                SAVE
            =============================================== */}

            <div className="flex justify-end gap-3">
              <Link
                href="/home/materials"
                className="rounded-2xl border border-black/10 bg-white px-6 py-3 text-sm font-semibold text-black/55"
              >
                Cancel
              </Link>

              <button
                type="submit"
                className="rounded-2xl bg-orange-500 px-7 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
              >
                Create Material Profile
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}

/* =========================================================
   STYLING
========================================================= */

const inputClass =
  "h-12 w-full rounded-2xl border border-black/10 bg-[#faf8f4] px-4 text-sm text-black outline-none transition placeholder:text-black/25 focus:border-orange-400 focus:ring-2 focus:ring-orange-100";

/* =========================================================
   COMPONENTS
========================================================= */

function Card({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[2rem] border border-black/10 bg-white p-7 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-600">
        {eyebrow}
      </p>

      <h2 className="mt-2 text-xl font-semibold text-black">
        {title}
      </h2>

      <p className="mt-2 text-sm leading-6 text-black/45">
        {description}
      </p>

      <div className="mt-7">
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
  type = "text",
  placeholder,
  defaultValue,
  required = false,
  min,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  min?: string;
}) {
  return (
    <label>
      <Label>{label}</Label>

      <input
        type={type}
        name={name}
        placeholder={placeholder}
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
  placeholder,
  required = false,
}: {
  label: string;
  name: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label>
      <Label>{label}</Label>

      <textarea
        name={name}
        placeholder={placeholder}
        required={required}
        rows={4}
        className="w-full rounded-2xl border border-black/10 bg-[#faf8f4] px-4 py-3 text-sm outline-none transition placeholder:text-black/25 focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
      />
    </label>
  );
}

function SelectField({
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
}: {
  label: string;
  name: string;
}) {
  return (
    <label>
      <Label>{label}</Label>

      <select
        name={name}
        defaultValue="NOT_PROVIDED"
        className={inputClass}
      >
        <option value="NOT_PROVIDED">
          Not provided
        </option>

        <option value="PROVIDED_WITH_WASTE">
          Provided with waste
        </option>

        <option value="GUIDANCE">
          Guidance
        </option>

        <option value="OWN_TESTING">
          Own testing
        </option>
      </select>
    </label>
  );
}

function Checkbox({
  name,
  label,
}: {
  name: string;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-2xl bg-[#faf8f4] p-4">
      <input
        type="checkbox"
        name={name}
        className="h-4 w-4 accent-orange-500"
      />

      <span className="text-sm font-medium text-black/65">
        {label}
      </span>
    </label>
  );
}

function Message({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-800">
      {children}
    </div>
  );
}