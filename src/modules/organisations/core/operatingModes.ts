// src/modules/organisations/core/operatingModes.ts

import type { OrganisationOperatingMode } from "@/db/schema";

export type OrganisationCapability = "generator" | "carrier" | "manager";

export const OPERATING_MODES = [
  "solo",
  "team",
  "multi_site",
  "carrier_ops",
  "enterprise",
] as const satisfies readonly OrganisationOperatingMode[];

export const SOLO_DEFAULT_CAPABILITIES: OrganisationCapability[] = [
  "generator",
  "carrier",
  "manager",
];

export const OPERATING_MODE_LABELS: Record<OrganisationOperatingMode, string> = {
  solo: "Solo Operator",
  team: "Team Mode",
  multi_site: "Multi-Site Mode",
  carrier_ops: "Carrier Operations",
  enterprise: "Enterprise",
};

export const OPERATING_MODE_DESCRIPTIONS: Record<
  OrganisationOperatingMode,
  string
> = {
  solo:
    "For one-person operators who need to run the full waste workflow themselves without team or department complexity.",
  team:
    "For small teams using departments, assignments, receipts, incidents and reports.",
  multi_site:
    "For organisations operating across multiple depots, transfer stations, yards or sites.",
  carrier_ops:
    "For carriers and skip hire operators managing Waste X jobs and external/private jobs.",
  enterprise:
    "For larger compliance-heavy organisations needing advanced controls, reporting and onboarding.",
};

export type OrganisationModeInput = {
  operatingMode?: OrganisationOperatingMode | null;
  capabilities?: OrganisationCapability[] | null;
};

export type OrganisationModeContext = OrganisationModeInput & {
  siteCount?: number | null;
};

export function normaliseOperatingMode(
  value: string | null | undefined,
): OrganisationOperatingMode {
  if (OPERATING_MODES.includes(value as OrganisationOperatingMode)) {
    return value as OrganisationOperatingMode;
  }

  return "team";
}

export function getOrganisationOperatingMode(
  organisation: OrganisationModeInput | null | undefined,
): OrganisationOperatingMode {
  return normaliseOperatingMode(organisation?.operatingMode);
}

export function getOrganisationCapabilities(
  organisation: OrganisationModeInput | null | undefined,
): OrganisationCapability[] {
  const mode = getOrganisationOperatingMode(organisation);

  /*
    Solo mode means one person may operate the whole workflow.

    We still respect stored capabilities when present, but if a solo org has
    no capabilities recorded, we treat it as full single-operator access.
  */
  if (mode === "solo" && (!organisation?.capabilities?.length)) {
    return SOLO_DEFAULT_CAPABILITIES;
  }

  return organisation?.capabilities ?? [];
}

export function getEffectiveOrganisationCapabilities(
  organisation: OrganisationModeInput | null | undefined,
): OrganisationCapability[] {
  const mode = getOrganisationOperatingMode(organisation);

  /*
    Product decision:
    solo = full single-operator workflow.

    This is intentionally different from getOrganisationCapabilities().
    It is used for navigation/permissions where solo users need access to
    generator + carrier + manager processes without department switching.
  */
  if (mode === "solo") {
    return SOLO_DEFAULT_CAPABILITIES;
  }

  return getOrganisationCapabilities(organisation);
}

export function hasCapability(
  organisation: OrganisationModeInput | null | undefined,
  capability: OrganisationCapability,
) {
  return getOrganisationCapabilities(organisation).includes(capability);
}

export function hasEffectiveCapability(
  organisation: OrganisationModeInput | null | undefined,
  capability: OrganisationCapability,
) {
  return getEffectiveOrganisationCapabilities(organisation).includes(capability);
}

export function isSoloMode(
  organisation: OrganisationModeInput | null | undefined,
) {
  return getOrganisationOperatingMode(organisation) === "solo";
}

export function isTeamMode(
  organisation: OrganisationModeInput | null | undefined,
) {
  return getOrganisationOperatingMode(organisation) === "team";
}

export function isMultiSiteMode(
  organisation: OrganisationModeInput | null | undefined,
) {
  return getOrganisationOperatingMode(organisation) === "multi_site";
}

export function isCarrierOpsMode(
  organisation: OrganisationModeInput | null | undefined,
) {
  return getOrganisationOperatingMode(organisation) === "carrier_ops";
}

export function isEnterpriseMode(
  organisation: OrganisationModeInput | null | undefined,
) {
  return getOrganisationOperatingMode(organisation) === "enterprise";
}

export function isAdvancedOperatingMode(
  organisation: OrganisationModeInput | null | undefined,
) {
  const mode = getOrganisationOperatingMode(organisation);

  return mode === "multi_site" || mode === "enterprise";
}

export function shouldShowDepartments(
  organisation: OrganisationModeInput | null | undefined,
) {
  /*
    Solo users should not need department management or department switching.
    They still get workflow access through effective capabilities.
  */
  return !isSoloMode(organisation);
}

export function shouldShowActiveDepartmentSwitcher(
  organisation: OrganisationModeInput | null | undefined,
) {
  return !isSoloMode(organisation);
}

export function shouldShowTeamMembers(
  organisation: OrganisationModeInput | null | undefined,
) {
  return !isSoloMode(organisation);
}

export function shouldShowSiteSwitcher(context: OrganisationModeContext) {
  const mode = getOrganisationOperatingMode(context);
  const siteCount = context.siteCount ?? 0;

  /*
    Solo operators can still have multiple working locations, but we only show
    the switcher when there is actually more than one site.
  */
  if (mode === "solo") {
    return siteCount > 1;
  }

  return siteCount > 1;
}

export function shouldShowSiteSettings(
  organisation: OrganisationModeInput | null | undefined,
) {
  /*
    Solo users should still be able to manage their Main Site and add sites if
    needed. We hide complexity in the UI, not by blocking access.
  */
  return true;
}

export function shouldShowExternalJobs(
  organisation: OrganisationModeInput | null | undefined,
) {
  const mode = getOrganisationOperatingMode(organisation);

  return (
    mode === "solo" ||
    mode === "carrier_ops" ||
    mode === "multi_site" ||
    mode === "enterprise" ||
    hasEffectiveCapability(organisation, "carrier")
  );
}

export function shouldShowMarketplace(
  organisation: OrganisationModeInput | null | undefined,
) {
  /*
    Solo users should be able to create/list/assign work. Do not hide the
    marketplace or listing flow just because they are one-person businesses.
  */
  if (isSoloMode(organisation)) {
    return true;
  }

  return (
    hasEffectiveCapability(organisation, "generator") ||
    hasEffectiveCapability(organisation, "manager") ||
    hasEffectiveCapability(organisation, "carrier")
  );
}

export function shouldShowCarrierHub(
  organisation: OrganisationModeInput | null | undefined,
) {
  /*
    Solo users need a simplified jobs/collections view rather than being blocked.
  */
  if (isSoloMode(organisation)) {
    return true;
  }

  const mode = getOrganisationOperatingMode(organisation);

  return (
    mode === "team" ||
    mode === "multi_site" ||
    mode === "enterprise" ||
    mode === "carrier_ops" ||
    hasEffectiveCapability(organisation, "manager") ||
    hasEffectiveCapability(organisation, "carrier")
  );
}

export function shouldShowReceiving(
  organisation: OrganisationModeInput | null | undefined,
) {
  if (isSoloMode(organisation)) {
    return true;
  }

  return (
    hasEffectiveCapability(organisation, "manager") ||
    getOrganisationOperatingMode(organisation) === "enterprise" ||
    getOrganisationOperatingMode(organisation) === "multi_site"
  );
}

export function shouldShowDwtSubmissions(
  organisation: OrganisationModeInput | null | undefined,
) {
  if (isSoloMode(organisation)) {
    return true;
  }

  return (
    hasEffectiveCapability(organisation, "manager") ||
    getOrganisationOperatingMode(organisation) === "enterprise" ||
    getOrganisationOperatingMode(organisation) === "multi_site"
  );
}

export function shouldShowIncidents(
  organisation: OrganisationModeInput | null | undefined,
) {
  if (isSoloMode(organisation)) {
    return true;
  }

  return (
    hasEffectiveCapability(organisation, "generator") ||
    hasEffectiveCapability(organisation, "manager") ||
    hasEffectiveCapability(organisation, "carrier")
  );
}

export function shouldShowReports(
  organisation: OrganisationModeInput | null | undefined,
) {
  /*
    Reports are a core reason a one-person operator would use Waste X.
  */
  if (isSoloMode(organisation)) {
    return true;
  }

  return true;
}

export function shouldShowAdvancedCompliance(
  organisation: OrganisationModeInput | null | undefined,
) {
  const mode = getOrganisationOperatingMode(organisation);

  return mode === "multi_site" || mode === "enterprise";
}

export function shouldUseSimplifiedNavigation(
  organisation: OrganisationModeInput | null | undefined,
) {
  /*
    Simplified navigation does NOT mean restricted navigation.
    It means solo-friendly labels and fewer team/admin concepts.
  */
  return isSoloMode(organisation);
}

export function getOperatingModeLabel(
  mode: OrganisationOperatingMode | null | undefined,
) {
  return OPERATING_MODE_LABELS[normaliseOperatingMode(mode)];
}

export function getOperatingModeDescription(
  mode: OrganisationOperatingMode | null | undefined,
) {
  return OPERATING_MODE_DESCRIPTIONS[normaliseOperatingMode(mode)];
}

export function inferOperatingModeFromSetup(params: {
  capabilities: OrganisationCapability[];
  selectedSetup?: string | null;
  siteCount?: number | null;
}): OrganisationOperatingMode {
  const selectedSetup = params.selectedSetup?.trim();

  if (selectedSetup === "solo") return "solo";
  if (selectedSetup === "team") return "team";
  if (selectedSetup === "multi_site") return "multi_site";
  if (selectedSetup === "carrier_ops") return "carrier_ops";
  if (selectedSetup === "enterprise") return "enterprise";

  if ((params.siteCount ?? 0) > 1) return "multi_site";

  const carrierOnly =
    params.capabilities.includes("carrier") &&
    !params.capabilities.includes("generator") &&
    !params.capabilities.includes("manager");

  if (carrierOnly) return "carrier_ops";

  return "team";
}