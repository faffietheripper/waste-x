// src/modules/organisations/core/operatingModes.ts

import type { OrganisationOperatingMode } from "@/db/schema";

/* =========================================================
   TYPES
========================================================= */

export type OrganisationCapability =
  | "generator"
  | "carrier"
  | "manager";

export type OrganisationModeInput = {
  operatingMode?: OrganisationOperatingMode | null;
  capabilities?: OrganisationCapability[] | null;
};

export type OrganisationModeContext =
  OrganisationModeInput & {
    siteCount?: number | null;
  };

/* =========================================================
   MVP PRODUCT SWITCH
========================================================= */

/**
 * CURRENT WASTE X MVP MODE
 *
 * true:
 *
 *   Waste X presents the Solo Workspace as the primary
 *   operational product for every normal organisation.
 *
 *   Generator / Carrier / department-driven workspaces remain
 *   in the codebase but are not part of the active MVP.
 *
 * false:
 *
 *   Waste X goes back to respecting the organisation's stored
 *   operatingMode and the legacy/network workspace logic can
 *   become active again.
 *
 * IMPORTANT:
 *
 * This is a PRODUCT switch.
 *
 * It does not delete:
 *
 * - capabilities
 * - departments
 * - assignments
 * - carrier workflows
 * - marketplace infrastructure
 * - future multi-site / enterprise modes
 */
export const SOLO_WORKSPACE_MVP = true;

/* =========================================================
   OPERATING MODES
========================================================= */

export const OPERATING_MODES = [
  "solo",
  "team",
  "multi_site",
  "carrier_ops",
  "enterprise",
] as const satisfies readonly OrganisationOperatingMode[];

/* =========================================================
   LEGACY COMPATIBILITY CAPABILITIES
========================================================= */

/**
 * Solo Workspace currently needs access to some code that was
 * originally protected by generator / carrier / manager
 * permissions.
 *
 * These capabilities are therefore used internally as a
 * compatibility bridge.
 *
 * They DO NOT determine which workspaces are visible in the
 * Solo MVP navigation.
 */
export const SOLO_DEFAULT_CAPABILITIES: OrganisationCapability[] =
  ["generator", "carrier", "manager"];

/* =========================================================
   LABELS
========================================================= */

export const OPERATING_MODE_LABELS: Record<
  OrganisationOperatingMode,
  string
> = {
  solo: "Solo Workspace",
  team: "Team Mode",
  multi_site: "Multi-Site Mode",
  carrier_ops: "Carrier Operations",
  enterprise: "Enterprise",
};

/* =========================================================
   DESCRIPTIONS
========================================================= */

export const OPERATING_MODE_DESCRIPTIONS: Record<
  OrganisationOperatingMode,
  string
> = {
  solo:
    "The primary Waste X operational workspace for managing receiving-site activity, Digital Waste Tracking, reusable business data, reporting and marketplace access without department switching.",

  team:
    "Legacy collaborative workspace using operational departments and assignment-based workflows.",

  multi_site:
    "Workspace for organisations operating across multiple depots, transfer stations, yards or permitted sites.",

  carrier_ops:
    "Dedicated carrier operations workspace for transport and collection workflows.",

  enterprise:
    "Advanced workspace for larger organisations requiring multi-site controls, compliance oversight and expanded administration.",
};

/* =========================================================
   NORMALISE MODE
========================================================= */

export function normaliseOperatingMode(
  value: string | null | undefined,
): OrganisationOperatingMode {
  /*
    MVP rule:

    Force the active product into Solo Workspace.

    This also means an old organisation with:

      operatingMode = "team"

    behaves as Solo without requiring us to rewrite every old
    database row immediately.
  */

  if (SOLO_WORKSPACE_MVP) {
    return "solo";
  }

  if (
    OPERATING_MODES.includes(
      value as OrganisationOperatingMode,
    )
  ) {
    return value as OrganisationOperatingMode;
  }

  return "team";
}

/* =========================================================
   GET OPERATING MODE
========================================================= */

export function getOrganisationOperatingMode(
  organisation:
    | OrganisationModeInput
    | null
    | undefined,
): OrganisationOperatingMode {
  return normaliseOperatingMode(
    organisation?.operatingMode,
  );
}

/* =========================================================
   STORED CAPABILITIES
========================================================= */

export function getOrganisationCapabilities(
  organisation:
    | OrganisationModeInput
    | null
    | undefined,
): OrganisationCapability[] {
  const capabilities =
    organisation?.capabilities ?? [];

  /*
    Preserve the old Solo behaviour for organisations created
    before capabilities were populated properly.
  */

  if (
    getOrganisationOperatingMode(organisation) ===
      "solo" &&
    capabilities.length === 0
  ) {
    return SOLO_DEFAULT_CAPABILITIES;
  }

  return capabilities;
}

/* =========================================================
   EFFECTIVE CAPABILITIES
========================================================= */

export function getEffectiveOrganisationCapabilities(
  organisation:
    | OrganisationModeInput
    | null
    | undefined,
): OrganisationCapability[] {
  const mode =
    getOrganisationOperatingMode(organisation);

  /*
    Solo Workspace gets the complete compatibility capability
    set internally.

    Again: this does NOT make Generator / Carrier navigation
    visible.
  */

  if (mode === "solo") {
    return SOLO_DEFAULT_CAPABILITIES;
  }

  return getOrganisationCapabilities(organisation);
}

/* =========================================================
   CAPABILITY HELPERS
========================================================= */

export function hasCapability(
  organisation:
    | OrganisationModeInput
    | null
    | undefined,
  capability: OrganisationCapability,
) {
  return getOrganisationCapabilities(
    organisation,
  ).includes(capability);
}

export function hasEffectiveCapability(
  organisation:
    | OrganisationModeInput
    | null
    | undefined,
  capability: OrganisationCapability,
) {
  return getEffectiveOrganisationCapabilities(
    organisation,
  ).includes(capability);
}

/* =========================================================
   MODE HELPERS
========================================================= */

export function isSoloMode(
  organisation:
    | OrganisationModeInput
    | null
    | undefined,
) {
  return (
    getOrganisationOperatingMode(organisation) ===
    "solo"
  );
}

export function isTeamMode(
  organisation:
    | OrganisationModeInput
    | null
    | undefined,
) {
  return (
    getOrganisationOperatingMode(organisation) ===
    "team"
  );
}

export function isMultiSiteMode(
  organisation:
    | OrganisationModeInput
    | null
    | undefined,
) {
  return (
    getOrganisationOperatingMode(organisation) ===
    "multi_site"
  );
}

export function isCarrierOpsMode(
  organisation:
    | OrganisationModeInput
    | null
    | undefined,
) {
  return (
    getOrganisationOperatingMode(organisation) ===
    "carrier_ops"
  );
}

export function isEnterpriseMode(
  organisation:
    | OrganisationModeInput
    | null
    | undefined,
) {
  return (
    getOrganisationOperatingMode(organisation) ===
    "enterprise"
  );
}

export function isAdvancedOperatingMode(
  organisation:
    | OrganisationModeInput
    | null
    | undefined,
) {
  const mode =
    getOrganisationOperatingMode(organisation);

  return (
    mode === "multi_site" ||
    mode === "enterprise"
  );
}

/* =========================================================
   DEPARTMENT UI
========================================================= */

export function shouldShowDepartments(
  organisation:
    | OrganisationModeInput
    | null
    | undefined,
) {
  /*
    Solo Workspace does not expose the old department model.
  */

  return !isSoloMode(organisation);
}

export function shouldShowActiveDepartmentSwitcher(
  organisation:
    | OrganisationModeInput
    | null
    | undefined,
) {
  return !isSoloMode(organisation);
}

/* =========================================================
   TEAM UI
========================================================= */

export function shouldShowTeamMembers(
  organisation:
    | OrganisationModeInput
    | null
    | undefined,
) {
  /*
    The old team-management workflow is not part of the current
    Solo MVP navigation.

    We can introduce a simpler account/permissions model later.
  */

  return !isSoloMode(organisation);
}

/* =========================================================
   SITE UI
========================================================= */

export function shouldShowSiteSwitcher(
  context: OrganisationModeContext,
) {
  const siteCount = context.siteCount ?? 0;

  /*
    Regardless of mode, switching only makes sense when there
    is more than one site.
  */

  return siteCount > 1;
}

export function shouldShowSiteSettings(
  _organisation:
    | OrganisationModeInput
    | null
    | undefined,
) {
  /*
    Site configuration is core to the new Waste X MVP.
  */

  return true;
}

/* =========================================================
   EXTERNAL / CARRIER JOBS
========================================================= */

export function shouldShowExternalJobs(
  organisation:
    | OrganisationModeInput
    | null
    | undefined,
) {
  /*
    This is the OLD carrier/external-assignment area.

    It is deliberately hidden from Solo Workspace.
  */

  if (isSoloMode(organisation)) {
    return false;
  }

  const mode =
    getOrganisationOperatingMode(organisation);

  return (
    mode === "carrier_ops" ||
    mode === "multi_site" ||
    mode === "enterprise" ||
    hasEffectiveCapability(
      organisation,
      "carrier",
    )
  );
}

/* =========================================================
   MARKETPLACE
========================================================= */

export function shouldShowMarketplace(
  organisation:
    | OrganisationModeInput
    | null
    | undefined,
) {
  /*
    Marketplace stays in the current Waste X MVP.
  */

  if (isSoloMode(organisation)) {
    return true;
  }

  return (
    hasEffectiveCapability(
      organisation,
      "generator",
    ) ||
    hasEffectiveCapability(
      organisation,
      "manager",
    ) ||
    hasEffectiveCapability(
      organisation,
      "carrier",
    )
  );
}

/* =========================================================
   CARRIER HUB
========================================================= */

export function shouldShowCarrierHub(
  organisation:
    | OrganisationModeInput
    | null
    | undefined,
) {
  /*
    Old carrier-management UI is hidden from the Solo MVP.
  */

  if (isSoloMode(organisation)) {
    return false;
  }

  const mode =
    getOrganisationOperatingMode(organisation);

  return (
    mode === "team" ||
    mode === "multi_site" ||
    mode === "enterprise" ||
    mode === "carrier_ops" ||
    hasEffectiveCapability(
      organisation,
      "manager",
    ) ||
    hasEffectiveCapability(
      organisation,
      "carrier",
    )
  );
}

/* =========================================================
   RECEIVING
========================================================= */

export function shouldShowReceiving(
  organisation:
    | OrganisationModeInput
    | null
    | undefined,
) {
  /*
    Receiving / DWT intake is core to Solo Workspace.
  */

  if (isSoloMode(organisation)) {
    return true;
  }

  const mode =
    getOrganisationOperatingMode(organisation);

  return (
    hasEffectiveCapability(
      organisation,
      "manager",
    ) ||
    mode === "enterprise" ||
    mode === "multi_site"
  );
}

/* =========================================================
   DWT
========================================================= */

export function shouldShowDwtSubmissions(
  organisation:
    | OrganisationModeInput
    | null
    | undefined,
) {
  if (isSoloMode(organisation)) {
    return true;
  }

  const mode =
    getOrganisationOperatingMode(organisation);

  return (
    hasEffectiveCapability(
      organisation,
      "manager",
    ) ||
    mode === "enterprise" ||
    mode === "multi_site"
  );
}

/* =========================================================
   OLD INCIDENT MODULE
========================================================= */

export function shouldShowIncidents(
  organisation:
    | OrganisationModeInput
    | null
    | undefined,
) {
  /*
    The existing assignment-centric incident module is not part
    of the current Solo MVP.

    We are preserving the code for future network workflows.
  */

  if (isSoloMode(organisation)) {
    return false;
  }

  return (
    hasEffectiveCapability(
      organisation,
      "generator",
    ) ||
    hasEffectiveCapability(
      organisation,
      "manager",
    ) ||
    hasEffectiveCapability(
      organisation,
      "carrier",
    )
  );
}

/* =========================================================
   REPORTS
========================================================= */

export function shouldShowReports(
  _organisation:
    | OrganisationModeInput
    | null
    | undefined,
) {
  /*
    Reporting remains core across Waste X.
  */

  return true;
}

/* =========================================================
   ADVANCED COMPLIANCE
========================================================= */

export function shouldShowAdvancedCompliance(
  organisation:
    | OrganisationModeInput
    | null
    | undefined,
) {
  const mode =
    getOrganisationOperatingMode(organisation);

  return (
    mode === "multi_site" ||
    mode === "enterprise"
  );
}

/* =========================================================
   NAVIGATION MODE
========================================================= */

export function shouldUseSimplifiedNavigation(
  organisation:
    | OrganisationModeInput
    | null
    | undefined,
) {
  return isSoloMode(organisation);
}

/* =========================================================
   DISPLAY HELPERS
========================================================= */

export function getOperatingModeLabel(
  mode:
    | OrganisationOperatingMode
    | null
    | undefined,
) {
  return OPERATING_MODE_LABELS[
    normaliseOperatingMode(mode)
  ];
}

export function getOperatingModeDescription(
  mode:
    | OrganisationOperatingMode
    | null
    | undefined,
) {
  return OPERATING_MODE_DESCRIPTIONS[
    normaliseOperatingMode(mode)
  ];
}

/* =========================================================
   ONBOARDING / SETUP INFERENCE
========================================================= */

export function inferOperatingModeFromSetup(params: {
  capabilities: OrganisationCapability[];
  selectedSetup?: string | null;
  siteCount?: number | null;
}): OrganisationOperatingMode {
  /*
    During the current MVP every newly configured organisation
    should enter the Solo Workspace.
  */

  if (SOLO_WORKSPACE_MVP) {
    return "solo";
  }

  const selectedSetup =
    params.selectedSetup?.trim();

  if (selectedSetup === "solo") {
    return "solo";
  }

  if (selectedSetup === "team") {
    return "team";
  }

  if (selectedSetup === "multi_site") {
    return "multi_site";
  }

  if (selectedSetup === "carrier_ops") {
    return "carrier_ops";
  }

  if (selectedSetup === "enterprise") {
    return "enterprise";
  }

  if ((params.siteCount ?? 0) > 1) {
    return "multi_site";
  }

  const carrierOnly =
    params.capabilities.includes("carrier") &&
    !params.capabilities.includes("generator") &&
    !params.capabilities.includes("manager");

  if (carrierOnly) {
    return "carrier_ops";
  }

  return "team";
}