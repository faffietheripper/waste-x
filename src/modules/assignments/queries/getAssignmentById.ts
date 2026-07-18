import { database } from "@/db/database";
import {
  carrierAssignments,
  wasteListings,
  organisations,
  incidents,
} from "@/db/schema";
import { eq } from "drizzle-orm";

/* =========================================================
   TYPES
========================================================= */

type AnyRecord = Record<string, any>;

type IncidentSummary = {
  id: string;
  status: string | null;
  type: string | null;
  summary: string | null;
  immediateAction: string | null;
  investigationFindings: string | null;
  correctiveActions: string | null;
  preventativeMeasures: string | null;
  dateClosed: Date | null;
  createdAt: Date | null;
};

/* =========================================================
   QUERY
========================================================= */

export async function getAssignmentById(assignmentId: string) {
  if (!assignmentId?.trim()) {
    return null;
  }

  const assignment = await database.query.carrierAssignments.findFirst({
    where: eq(carrierAssignments.id, assignmentId),
  });

  if (!assignment) {
    return null;
  }

  const assignmentRecord = assignment as AnyRecord;

  const listing = assignment.listingId
    ? await database.query.wasteListings.findFirst({
        where: eq(wasteListings.id, assignment.listingId),
      })
    : null;

  const listingRecord = listing as AnyRecord | null;

  /*
    Build-safe lookup.

    Some older/newer Waste X schema versions may have:
    - generatorOrganisationId
    - organisationId
    - assignedByOrganisationId
    - listing.organisationId

    TypeScript may not expose generatorOrganisationId on the Drizzle row,
    so we read it safely from assignmentRecord.
  */
  const generatorOrganisationId =
    getStringField(assignmentRecord, "generatorOrganisationId") ??
    getStringField(assignmentRecord, "organisationId") ??
    getStringField(assignmentRecord, "assignedByOrganisationId") ??
    getStringField(listingRecord, "organisationId") ??
    null;

  const managerOrganisationId =
    getStringField(assignmentRecord, "managerOrganisationId") ??
    getStringField(assignmentRecord, "assignedByOrganisationId") ??
    null;

  const carrierOrganisationId =
    getStringField(assignmentRecord, "carrierOrganisationId") ?? null;

  const [carrierOrg, generatorOrg, managerOrg, allIncidents] =
    await Promise.all([
      getOrganisationById(carrierOrganisationId),
      getOrganisationById(generatorOrganisationId),
      getOrganisationById(managerOrganisationId),

      database.query.incidents.findMany({
        where: eq(incidents.assignmentId, assignmentId),
      }),
    ]);

  const unresolvedIncidents = allIncidents.filter(
    (incident) => incident.status !== "resolved",
  );

  const openIncident = allIncidents.find(
    (incident) =>
      incident.status === "open" || incident.status === "under_review",
  );

  const latestIncident = getLatestIncident(allIncidents);

  return {
    ...assignment,

    listing,

    carrierOrg,
    generatorOrg,
    managerOrg,

    incident: normaliseIncident(latestIncident),

    hasIncident: allIncidents.length > 0,
    hasOpenIncident: Boolean(openIncident),
    hasUnresolvedIncident: unresolvedIncidents.length > 0,
    unresolvedIncidentCount: unresolvedIncidents.length,
  };
}

/* =========================================================
   HELPERS
========================================================= */

async function getOrganisationById(organisationId: string | null | undefined) {
  if (!organisationId) {
    return null;
  }

  return database.query.organisations.findFirst({
    where: eq(organisations.id, organisationId),
  });
}

function getStringField(record: AnyRecord | null | undefined, key: string) {
  if (!record) {
    return null;
  }

  const value = record[key];

  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.trim();

  return cleaned.length > 0 ? cleaned : null;
}

function getLatestIncident(allIncidents: AnyRecord[]) {
  if (allIncidents.length === 0) {
    return null;
  }

  return [...allIncidents].sort((first, second) => {
    const firstTime = getTime(first.createdAt);
    const secondTime = getTime(second.createdAt);

    return secondTime - firstTime;
  })[0];
}

function getTime(value: unknown) {
  if (!value) {
    return 0;
  }

  const date = new Date(value as string | Date);

  if (!Number.isFinite(date.getTime())) {
    return 0;
  }

  return date.getTime();
}

function normaliseIncident(incident: AnyRecord | null): IncidentSummary | null {
  if (!incident) {
    return null;
  }

  return {
    id: String(incident.id),
    status: incident.status ?? null,
    type: incident.type ?? null,
    summary: incident.summary ?? null,
    immediateAction: incident.immediateAction ?? null,
    investigationFindings: incident.investigationFindings ?? null,
    correctiveActions: incident.correctiveActions ?? null,
    preventativeMeasures: incident.preventativeMeasures ?? null,
    dateClosed: incident.dateClosed ?? null,
    createdAt: incident.createdAt ?? null,
  };
}