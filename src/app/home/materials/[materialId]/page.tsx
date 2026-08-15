// src/app/home/materials/[materialId]/page.tsx

import Link from "next/link";

import {
  and,
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
  sites,
  users,
} from "@/db/schema";

import {
  archiveMaterialProfileAction,
  restoreMaterialProfileAction,
} from "../actions";

/* =========================================================
   TYPES
========================================================= */

type SearchParams = {
  success?: string | string[];
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

/* =========================================================
   PAGE
========================================================= */

export default async function MaterialDetailPage({
  params,
  searchParams,
}: {
  params: {
    materialId: string;
  };

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
        organisationId: true,
        role: true,
      },
    });

  if (!currentUser?.organisationId) {
    redirect("/home");
  }

  const rows =
    await database
      .select({
        id:
          materialProfiles.id,

        name:
          materialProfiles.name,

        wasteDescription:
          materialProfiles.wasteDescription,

        physicalForm:
          materialProfiles.physicalForm,

        containerCount:
          materialProfiles.defaultNumberOfContainers,

        containerType:
          materialProfiles.defaultContainerType,

        weightMetric:
          materialProfiles.defaultWeightMetric,

        containsPops:
          materialProfiles.containsPops,

        popsSource:
          materialProfiles.popsSourceOfComponents,

        popsComponents:
          materialProfiles.popsComponents,

        containsHazardous:
          materialProfiles.containsHazardous,

        hazardousSource:
          materialProfiles.hazardousSourceOfComponents,

        hazardousHazCodes:
          materialProfiles.hazardousHazCodes,

        hazardousComponents:
          materialProfiles.hazardousComponents,

        isFavourite:
          materialProfiles.isFavourite,

        isActive:
          materialProfiles.isActive,

        notes:
          materialProfiles.notes,

        siteId:
          materialProfiles.siteId,

        siteName:
          sites.name,

        ewcId:
          ewcCodes.id,

        ewcCode:
          ewcCodes.code,

        ewcDescription:
          ewcCodes.description,

        ewcHazardous:
          ewcCodes.isHazardous,

        drCode:
          disposalRecoveryCodes.code,

        drDescription:
          disposalRecoveryCodes.description,
      })
      .from(materialProfiles)

      .innerJoin(
        ewcCodes,
        eq(
          materialProfiles.ewcCodeId,
          ewcCodes.id,
        ),
      )

      .leftJoin(
        disposalRecoveryCodes,
        eq(
          materialProfiles.defaultDisposalRecoveryCodeId,
          disposalRecoveryCodes.id,
        ),
      )

      .leftJoin(
        sites,
        eq(
          materialProfiles.siteId,
          sites.id,
        ),
      )

      .where(
        and(
          eq(
            materialProfiles.id,
            params.materialId,
          ),
          eq(
            materialProfiles.organisationId,
            currentUser.organisationId,
          ),
        ),
      )

      .limit(1);

  const material =
    rows[0];

  if (!material) {
    notFound();
  }

  /* =======================================================
     CURRENT PERMIT CHECK
  ======================================================= */

  let permitted = false;

  if (material.siteId) {
    const permit =
      await database.query.sitePermits.findFirst({
        where: and(
          eq(
            sitePermits.organisationId,
            currentUser.organisationId,
          ),
          eq(
            sitePermits.siteId,
            material.siteId,
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

    if (permit) {
      const link =
        await database.query.permitEwcCodes.findFirst({
          where: and(
            eq(
              permitEwcCodes.permitId,
              permit.id,
            ),
            eq(
              permitEwcCodes.ewcCodeId,
              material.ewcId,
            ),
            eq(
              permitEwcCodes.isActive,
              true,
            ),
          ),
        });

      permitted =
        Boolean(link);
    }
  }

  const success =
    firstParam(
      searchParams.success,
    );

  const canEdit =
    currentUser.role ===
      "administrator" ||
    currentUser.role ===
      "seniorManagement";

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

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <h1 className="text-4xl font-semibold">
                {material.name}
              </h1>

              {material.isFavourite && (
                <Badge>
                  Favourite
                </Badge>
              )}

              {!material.isActive && (
                <Badge>
                  Archived
                </Badge>
              )}
            </div>

            <p className="mt-3 font-mono text-lg text-orange-400">
              {formatEwcCode(
                material.ewcCode,
              )}

              {material.containsHazardous
                ? "*"
                : ""}
            </p>
          </div>
        </section>

        {success && (
          <div className="rounded-2xl border border-green-200 bg-green-50 px-5 py-4 text-sm font-medium text-green-800">
            {success === "created"
              ? "Material profile created."
              : success === "updated"
                ? "Material profile updated."
                : success === "archived"
                  ? "Material profile archived."
                  : success === "restored"
                    ? "Material profile restored."
                    : "Changes saved."}
          </div>
        )}

        {/* =================================================
            PERMIT STATUS
        ================================================= */}

        <section
          className={
            permitted
              ? "rounded-[2rem] border border-green-200 bg-green-50 p-6"
              : "rounded-[2rem] border border-red-200 bg-red-50 p-6"
          }
        >
          <p className="text-xs font-semibold uppercase tracking-[0.18em]">
            Current permit check
          </p>

          <h2 className="mt-2 text-xl font-semibold text-black">
            {permitted
              ? "✓ EWC currently configured against the receiving-site permit"
              : "⚠ EWC is not currently configured against the active receiving-site permit"}
          </h2>

          <p className="mt-2 text-sm text-black/50">
            {material.siteName ??
              "Receiving site not linked"}
          </p>
        </section>

        {/* =================================================
            CORE DETAILS
        ================================================= */}

        <section className="rounded-[2rem] border border-black/10 bg-white p-7 shadow-sm">
          <div className="grid gap-7 md:grid-cols-2">
            <Detail
              label="Material"
              value={
                material.name
              }
            />

            <Detail
              label="EWC"
              value={`${formatEwcCode(
                material.ewcCode,
              )}${
                material.ewcHazardous
                  ? "*"
                  : ""
              }`}
            />

            <Detail
              label="EWC description"
              value={
                material.ewcDescription
              }
            />

            <Detail
              label="Physical form"
              value={
                material.physicalForm
              }
            />

            <Detail
              label="Default container"
              value={`${material.containerCount} × ${material.containerType}`}
            />

            <Detail
              label="Weight unit"
              value={
                material.weightMetric
              }
            />

            <Detail
              label="D/R code"
              value={
                material.drCode
                  ? `${material.drCode} — ${material.drDescription ?? ""}`
                  : "Not configured"
              }
            />

            <Detail
              label="Receiving site"
              value={
                material.siteName ??
                "Not linked"
              }
            />
          </div>

          <div className="mt-7 border-t border-black/10 pt-6">
            <Detail
              label="Waste description"
              value={
                material.wasteDescription
              }
            />
          </div>
        </section>

        {/* =================================================
            CLASSIFICATION
        ================================================= */}

        <section className="grid gap-5 lg:grid-cols-2">
          <InfoCard
            title="POPs"
            active={
              material.containsPops
            }
          >
            <Detail
              label="Source"
              value={
                material.popsSource ??
                "Not applicable"
              }
            />

            <Detail
              label="Components"
              value={
                material.popsComponents ??
                "None stored"
              }
            />
          </InfoCard>

          <InfoCard
            title="Hazardous"
            active={
              material.containsHazardous
            }
          >
            <Detail
              label="Source"
              value={
                material.hazardousSource ??
                "Not applicable"
              }
            />

            <Detail
              label="Haz codes"
              value={
                material.hazardousHazCodes ??
                "None stored"
              }
            />

            <Detail
              label="Components"
              value={
                material.hazardousComponents ??
                "None stored"
              }
            />
          </InfoCard>
        </section>

        {material.notes && (
          <section className="rounded-[2rem] border border-black/10 bg-white p-7 shadow-sm">
            <Detail
              label="Internal notes"
              value={
                material.notes
              }
            />
          </section>
        )}

        {/* =================================================
            ACTIONS
        ================================================= */}

        {canEdit && (
          <section className="flex flex-wrap gap-3 rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <Link
              href={`/home/materials/${material.id}/edit`}
              className="rounded-2xl bg-black px-6 py-3 text-sm font-semibold text-orange-400"
            >
              Edit Profile
            </Link>

            {material.isActive ? (
              <form
                action={
                  archiveMaterialProfileAction
                }
              >
                <input
                  type="hidden"
                  name="materialId"
                  value={
                    material.id
                  }
                />

                <button
                  type="submit"
                  className="rounded-2xl border border-red-200 bg-red-50 px-6 py-3 text-sm font-semibold text-red-700"
                >
                  Archive
                </button>
              </form>
            ) : (
              <form
                action={
                  restoreMaterialProfileAction
                }
              >
                <input
                  type="hidden"
                  name="materialId"
                  value={
                    material.id
                  }
                />

                <button
                  type="submit"
                  className="rounded-2xl border border-green-200 bg-green-50 px-6 py-3 text-sm font-semibold text-green-700"
                >
                  Restore
                </button>
              </form>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

/* =========================================================
   COMPONENTS
========================================================= */

function Detail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/30">
        {label}
      </p>

      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-black/65">
        {value}
      </p>
    </div>
  );
}

function InfoCard({
  title,
  active,
  children,
}: {
  title: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[2rem] border border-black/10 bg-white p-7 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">
          {title}
        </h2>

        <span
          className={
            active
              ? "rounded-full bg-red-50 px-3 py-1 text-[10px] font-semibold uppercase text-red-700"
              : "rounded-full bg-green-50 px-3 py-1 text-[10px] font-semibold uppercase text-green-700"
          }
        >
          {active
            ? "Yes"
            : "No"}
        </span>
      </div>

      <div className="mt-6 space-y-5">
        {children}
      </div>
    </section>
  );
}

function Badge({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <span className="rounded-full border border-orange-400/20 bg-orange-500/15 px-3 py-1 text-[10px] font-semibold uppercase text-orange-300">
      {children}
    </span>
  );
}