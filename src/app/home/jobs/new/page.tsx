import Link from "next/link";
/* WASTE_X_OWN_CARRIER_DRIVER_DWT_V1 */
import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";
import { jobs, jobTemplates, users } from "@/db/schema";
import { getSoloMasterData } from "@/modules/master-data/core/getSoloMasterData";
import { getStage2Readiness } from "@/modules/master-data/core/getStage2Readiness";
import {
  canManageOwnCarrierDwtSettings,
} from "@/modules/digital-waste-tracking/data-access/saveOwnCarrierDwtSettings";
import { getWasteTrackingOrganisationSettings } from "@/modules/digital-waste-tracking/data-access/getWasteTrackingOrganisationSettings";

import BookJobForm from "./components/BookJobForm";
import type {
  BookJobFormData,
  BookJobInitialValues,
  BookJobTemplateOption,
} from "./lib/types";

type SearchParams = {
  error?: string | string[];
  repeat?: string | string[];
  duplicate?: string | string[];
  template?: string | string[];
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function dateInputValue(value: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(value);
}

function todayInLondon() {
  return dateInputValue(new Date());
}

async function getInitialValues({
  organisationId,
  repeatJobId,
  duplicateJobId,
  templateId,
}: {
  organisationId: string;
  repeatJobId: string;
  duplicateJobId: string;
  templateId: string;
}): Promise<BookJobInitialValues | undefined> {
  if (templateId) {
    const template = await database.query.jobTemplates.findFirst({
      where: and(
        eq(jobTemplates.id, templateId),
        eq(jobTemplates.organisationId, organisationId),
        eq(jobTemplates.isActive, true),
      ),
      columns: {
        id: true,
        name: true,
        direction: true,
        clientCounterpartyId: true,
        clientSiteId: true,
        haulierCounterpartyId: true,
        driverId: true,
        vehicleId: true,
        materialProfileId: true,
        plannedLoads: true,
        defaultCustomerReference: true,
        notes: true,
      },
    });

    if (!template || template.direction !== "incoming") {
      return undefined;
    }

    return {
      jobDate: todayInLondon(),
      plannedLoads: template.plannedLoads,
      purchaseOrder: "",
      customerReference: template.defaultCustomerReference ?? "",
      clientId: template.clientCounterpartyId ?? "",
      clientSiteId: template.clientSiteId ?? "",
      transportMode: template.haulierCounterpartyId ? "external" : "own",
      haulierId: template.haulierCounterpartyId ?? "",
      driverId: template.driverId ?? "",
      vehicleId: template.vehicleId ?? "",
      materialProfileId: template.materialProfileId ?? "",
      notes: template.notes ?? "",
      source: "template",
      sourceTemplateId: template.id,
      sourceLabel: `template “${template.name}”`,
    };
  }

  const sourceJobId = repeatJobId || duplicateJobId;

  if (!sourceJobId) {
    return undefined;
  }

  const sourceJob = await database.query.jobs.findFirst({
    where: and(
      eq(jobs.id, sourceJobId),
      eq(jobs.organisationId, organisationId),
    ),
    columns: {
      id: true,
      jobNumber: true,
      jobDate: true,
      direction: true,
      clientCounterpartyId: true,
      clientSiteId: true,
      haulierCounterpartyId: true,
      driverId: true,
      vehicleId: true,
      materialProfileId: true,
      plannedLoads: true,
      purchaseOrder: true,
      customerReference: true,
      notes: true,
    },
  });

  if (!sourceJob || sourceJob.direction !== "incoming") {
    return undefined;
  }

  const isDuplicate = Boolean(duplicateJobId);

  return {
    jobDate: isDuplicate ? dateInputValue(sourceJob.jobDate) : todayInLondon(),
    plannedLoads: sourceJob.plannedLoads,
    purchaseOrder: isDuplicate ? sourceJob.purchaseOrder ?? "" : "",
    customerReference: isDuplicate ? sourceJob.customerReference ?? "" : "",
    clientId: sourceJob.clientCounterpartyId ?? "",
    clientSiteId: sourceJob.clientSiteId ?? "",
    transportMode: sourceJob.haulierCounterpartyId ? "external" : "own",
    haulierId: sourceJob.haulierCounterpartyId ?? "",
    driverId: sourceJob.driverId ?? "",
    vehicleId: sourceJob.vehicleId ?? "",
    materialProfileId: sourceJob.materialProfileId ?? "",
    notes: sourceJob.notes ?? "",
    source: "repeat",
    sourceLabel: isDuplicate
      ? `duplicate of ${sourceJob.jobNumber}`
      : `repeat of ${sourceJob.jobNumber}`,
  };
}

export default async function NewJobPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const currentUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: {
      organisationId: true,
      role: true,
      isActive: true,
      isSuspended: true,
    },
  });

  if (
    !currentUser?.organisationId ||
    !currentUser.isActive ||
    currentUser.isSuspended
  ) {
    redirect("/home/settings/organisation");
  }

  const canBook =
    currentUser.role === "administrator" ||
    currentUser.role === "operations" ||
    currentUser.role === "seniorManagement" ||
    currentUser.role === "employee";

  if (!canBook) {
    redirect("/home/jobs?error=unauthorised");
  }

  const masterData = await getSoloMasterData(currentUser.organisationId);
  const dwtSettings = await getWasteTrackingOrganisationSettings({
    organisationId: currentUser.organisationId,
  });
  const canEditOwnCarrierDwt = canManageOwnCarrierDwtSettings(
    currentUser.role,
  );
  const readiness = getStage2Readiness(masterData);

  if (!masterData.receivingSite || !masterData.primaryPermit) {
    return (
      <main className="min-h-screen bg-[#f7f3ed] px-8 py-32 pl-[24vw]">
        <div className="mx-auto max-w-4xl rounded-[2rem] border border-amber-200 bg-amber-50 p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-700">
            Book a Job
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-black">
            Receiving setup is incomplete
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-black/55">
            Incoming Solo bookings need your primary receiving site and active permit
            before Waste X can create planned loads safely.
          </p>
          <Link
            href="/home/settings/data-readiness"
            className="mt-6 inline-flex rounded-2xl bg-black px-5 py-3 text-sm font-semibold text-orange-400"
          >
            Open Data Readiness
          </Link>
        </div>
      </main>
    );
  }

  const data: BookJobFormData = {
    receivingSite: {
      id: masterData.receivingSite.id,
      name: masterData.receivingSite.name,
      fullAddress: masterData.receivingSite.fullAddress,
      postcode: masterData.receivingSite.postcode,
    },
    primaryPermit: {
      id: masterData.primaryPermit.id,
      permitNumber: masterData.primaryPermit.permitNumber,
    },
    permittedEwcCodeIds: masterData.permittedEwcCodes.map((item) => item.id),
    permittedEwcCodes: masterData.permittedEwcCodes.map((item) => ({
      id: item.id,
      code: item.code,
      description: item.description,
      isHazardous: item.isHazardous,
    })),
    ownCarrierDwt: {
      registrationNumber:
        dwtSettings?.ownCarrierRegistrationNumber ?? "",
      reasonForNoRegistrationNumber:
        dwtSettings?.ownCarrierReasonForNoRegistrationNumber ?? "",
      meansOfTransport:
        dwtSettings?.ownCarrierMeansOfTransport ?? "Road",
      canEdit: canEditOwnCarrierDwt,
    },
    clients: masterData.clients.map((client) => ({
      id: client.id,
      name: client.name,
      accountReference: client.accountReference,
    })),
    clientSites: masterData.clientSites.map((site) => ({
      id: site.id,
      counterpartyId: site.counterpartyId,
      name: site.name,
      fullAddress: site.fullAddress,
      postcode: site.postcode,
      isDefault: site.isDefault,
    })),
    hauliers: masterData.hauliers.map((haulier) => ({
      id: haulier.id,
      name: haulier.name,
      carrierRegistrationNumber: haulier.carrierRegistrationNumber,
    })),
    drivers: masterData.drivers.map((driver) => ({
      id: driver.id,
      name: driver.name,
      haulierCounterpartyId: driver.haulierCounterpartyId,
      defaultVehicleId: driver.defaultVehicleId,
    })),
    vehicles: masterData.vehicles.map((vehicle) => ({
      id: vehicle.id,
      registrationNumber: vehicle.registrationNumber,
      vehicleType: vehicle.vehicleType,
      haulierCounterpartyId: vehicle.haulierCounterpartyId,
    })),
    materials: masterData.materials.map((material) => ({
      id: material.id,
      name: material.name,
      ewcCodeId: material.ewcCodeId,
      ewcCode: material.ewcCode,
      wasteDescription: material.wasteDescription,
      physicalForm: material.physicalForm,
      defaultWeightMetric: material.defaultWeightMetric,
      isFavourite: material.isFavourite,
    })),
    rates: masterData.rates.map((rate) => ({
      id: rate.id,
      rateType: rate.rateType,
      unit: rate.unit,
      amount: rate.amount,
      currency: rate.currency,
      counterpartyId: rate.counterpartyId,
      counterpartySiteId: rate.counterpartySiteId,
      ownSiteId: rate.ownSiteId,
      materialProfileId: rate.materialProfileId,
      effectiveFrom: rate.effectiveFrom?.toISOString() ?? null,
      effectiveTo: rate.effectiveTo?.toISOString() ?? null,
    })),
  };

  const repeatJobId = firstParam(searchParams.repeat);
  const duplicateJobId = firstParam(searchParams.duplicate);
  const templateId = firstParam(searchParams.template);

  const initialValues = await getInitialValues({
    organisationId: currentUser.organisationId,
    repeatJobId,
    duplicateJobId,
    templateId,
  });

  const templateRows = await database.query.jobTemplates.findMany({
    where: and(
      eq(jobTemplates.organisationId, currentUser.organisationId),
      eq(jobTemplates.isActive, true),
      eq(jobTemplates.direction, "incoming"),
    ),
    columns: {
      id: true,
      name: true,
      plannedLoads: true,
      lastUsedAt: true,
    },
    with: {
      client: {
        columns: { name: true },
      },
      materialProfile: {
        columns: { name: true },
      },
    },
    orderBy: [desc(jobTemplates.lastUsedAt), desc(jobTemplates.updatedAt)],
  });

  const templates: BookJobTemplateOption[] = templateRows.map((template) => ({
    id: template.id,
    name: template.name,
    clientName: template.client?.name ?? null,
    materialName: template.materialProfile?.name ?? null,
    plannedLoads: template.plannedLoads,
    lastUsedAt: template.lastUsedAt?.toISOString() ?? null,
  }));

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-8 py-32 pl-[24vw]">
      <div className="mx-auto max-w-7xl space-y-7">
        <section className="relative overflow-hidden rounded-[2rem] bg-black p-8 text-white">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-orange-500/20 blur-3xl" />

          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-orange-400">
                Operations · Stage 3
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight">
                Book a Job
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
                Book from scratch, repeat previous work or start from a reusable job
                template. Every option still opens the form for review before saving.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/home/jobs/templates"
                className="rounded-2xl border border-white/15 px-4 py-3 text-xs font-semibold text-white/75 transition hover:bg-white/10"
              >
                Job templates
              </Link>

              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/60">
                {readiness.readyForBookJob
                  ? "✓ Core master data ready"
                  : `${readiness.blockingFailures.length} setup item(s) still need attention`}
              </div>
            </div>
          </div>
        </section>

        {templates.length > 0 && !initialValues && (
          <section className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-orange-600">
                  Start faster
                </p>
                <h2 className="mt-2 text-xl font-semibold text-black">
                  Recent job templates
                </h2>
              </div>
              <Link
                href="/home/jobs/templates"
                className="text-xs font-semibold text-black/45 transition hover:text-orange-700"
              >
                View all templates →
              </Link>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {templates.slice(0, 6).map((template) => (
                <Link
                  key={template.id}
                  href={`/home/jobs/new?template=${template.id}`}
                  className="rounded-2xl border border-black/10 bg-[#faf8f4] p-4 transition hover:border-orange-300 hover:bg-orange-50"
                >
                  <p className="text-sm font-semibold text-black">{template.name}</p>
                  <p className="mt-1 text-xs text-black/45">
                    {[template.clientName, template.materialName]
                      .filter(Boolean)
                      .join(" · ") || "Reusable booking defaults"}
                  </p>
                  <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-orange-700">
                    {template.plannedLoads} planned load{template.plannedLoads === 1 ? "" : "s"}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {!readiness.readyForBookJob && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
            The Stage 2 readiness checker still has blocking items. Missing master data
            may prevent booking.
            <Link
              href="/home/settings/data-readiness"
              className="ml-2 font-semibold underline underline-offset-2"
            >
              Review readiness
            </Link>
          </section>
        )}

        <BookJobForm
          data={data}
          defaultDate={todayInLondon()}
          initialValues={initialValues}
          error={firstParam(searchParams.error)}
        />
      </div>
    </main>
  );
}
