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

export const OPERATING_MODE_LABELS: Record<OrganisationOperatingMode, string> = {
  solo: "Solo Mode",
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
    "For one-person or very small operators who need simple waste records without department complexity.",
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
  return organisation?.capabilities ?? [];
}

export function hasCapability(
  organisation: OrganisationModeInput | null | undefined,
  capability: OrganisationCapability,
) {
  return getOrganisationCapabilities(organisation).includes(capability);
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
  const mode = getOrganisationOperatingMode(organisation);

  return mode !== "solo";
}

export function shouldShowActiveDepartmentSwitcher(
  organisation: OrganisationModeInput | null | undefined,
) {
  const mode = getOrganisationOperatingMode(organisation);

  return mode !== "solo";
}

export function shouldShowTeamMembers(
  organisation: OrganisationModeInput | null | undefined,
) {
  const mode = getOrganisationOperatingMode(organisation);

  return mode !== "solo";
}

export function shouldShowSiteSwitcher(context: OrganisationModeContext) {
  const mode = getOrganisationOperatingMode(context);
  const siteCount = context.siteCount ?? 0;

  if (mode === "solo") return false;

  return siteCount > 1;
}

export function shouldShowSiteSettings(
  organisation: OrganisationModeInput | null | undefined,
) {
  const mode = getOrganisationOperatingMode(organisation);

  /*
    Even solo organisations can view their Main Site, but the UI should stay
    simple. Site settings become more important for carrier_ops, multi_site and
    enterprise.
  */
  return mode !== "solo";
}

export function shouldShowExternalJobs(
  organisation: OrganisationModeInput | null | undefined,
) {
  const mode = getOrganisationOperatingMode(organisation);

  return (
    mode === "carrier_ops" ||
    mode === "multi_site" ||
    mode === "enterprise" ||
    hasCapability(organisation, "carrier")
  );
}

export function shouldShowMarketplace(
  organisation: OrganisationModeInput | null | undefined,
) {
  const mode = getOrganisationOperatingMode(organisation);

  if (mode === "solo") {
    return (
      hasCapability(organisation, "generator") ||
      hasCapability(organisation, "manager")
    );
  }

  return true;
}

export function shouldShowCarrierHub(
  organisation: OrganisationModeInput | null | undefined,
) {
  const mode = getOrganisationOperatingMode(organisation);

  return (
    mode === "team" ||
    mode === "multi_site" ||
    mode === "enterprise" ||
    hasCapability(organisation, "manager")
  );
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