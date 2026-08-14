// src/modules/auth/core/permissions.ts

/* =========================================================
   CORE TYPES
========================================================= */

export type Capability = "generator" | "carrier" | "manager";

export type DepartmentType =
  | "generator"
  | "carrier"
  | "manager"
  | "compliance";

export type OrganisationOperatingMode =
  | "solo"
  | "team"
  | "multi_site"
  | "carrier_ops"
  | "enterprise";

export type Permission =
  /* Listings owned by generator */
  | "listing:view"
  | "listing:create"
  | "listing:edit"
  | "listing:assign"
  | "listing:direct_assign"

  /* Marketplace */
  | "marketplace:view"
  | "listing:bid"

  /* Templates */
  | "template:view"
  | "template:create"
  | "template:edit"

  /* Assignments */
  | "assignment:view"
  | "assignment:assign_carrier"
  | "assignment:accept"
  | "assignment:reject"
  | "assignment:cancel"
  | "assignment:complete"
  | "assignment:verify_collection"
  | "assignment:verify_receipt"
  | "assignment:receive_waste"

  /* Receiving / intake */
  | "receiving:view"
  | "receiving:create"
  | "receiving:update"
  | "receiving:submit"

  /* Digital Waste Tracking / DEFRA integration */
  | "dwt:view"
  | "dwt:submit_receive_movement"
  | "dwt:update_receive_movement"
  | "dwt:reference_data:view"
  | "dwt:reference_data:sync"

  /* Incidents */
  | "incident:view"
  | "incident:create"
  | "incident:resolve"

  /* Compliance */
  | "compliance:view"
  | "compliance:audit"
  | "compliance:reports"

  /* Organisation/system */
  | "team:view"
  | "team:manage"
  | "support:view"
  | "notification:view";

/* =========================================================
   SOLO MODE HELPERS

   Solo mode means:
   - one user can operate generator, carrier, manager and compliance workflows
   - there is no required active department
   - Waste X resolves a synthetic department type based on the action
========================================================= */

const SOLO_EFFECTIVE_CAPABILITIES: Capability[] = [
  "generator",
  "carrier",
  "manager",
];

function isSoloOperatingMode(
  operatingMode: OrganisationOperatingMode | string | null | undefined,
) {
  return operatingMode === "solo";
}

function getSoloEffectiveCapabilities(capabilities: Capability[]) {
  return Array.from(
    new Set<Capability>([...capabilities, ...SOLO_EFFECTIVE_CAPABILITIES]),
  );
}

function getSoloEffectiveDepartmentType(permission: Permission): DepartmentType {
  /*
    Listings and templates are generator-side workflows.
  */
  if (permission.startsWith("template:")) {
    return "generator";
  }

  if (
    permission === "listing:view" ||
    permission === "listing:create" ||
    permission === "listing:edit" ||
    permission === "listing:assign" ||
    permission === "listing:direct_assign"
  ) {
    return "generator";
  }

  /*
    Marketplace bidding is manager-side.
  */
  if (permission === "marketplace:view" || permission === "listing:bid") {
    return "manager";
  }

  /*
    Assignment permissions are split by operational perspective.
  */
  if (
    permission === "assignment:accept" ||
    permission === "assignment:reject" ||
    permission === "assignment:verify_collection"
  ) {
    return "carrier";
  }

  if (
    permission === "assignment:assign_carrier" ||
    permission === "assignment:receive_waste" ||
    permission === "assignment:verify_receipt"
  ) {
    return "manager";
  }

  if (permission === "assignment:view") {
    return "generator";
  }

  if (permission === "assignment:cancel" || permission === "assignment:complete") {
    return "generator";
  }

  /*
    Receiving is manager-side.
  */
  if (permission.startsWith("receiving:")) {
    return "manager";
  }

  /*
    DWT submission is a formal compliance event.
    Compliance can submit/update DWT in this MVP.
  */
  if (permission.startsWith("dwt:")) {
    return "compliance";
  }

  /*
    Solo can report incidents from the operational/carrier side,
    and can review/resolve incidents from the compliance side.
  */
  if (permission === "incident:create") {
    return "carrier";
  }

  if (permission === "incident:view" || permission === "incident:resolve") {
    return "compliance";
  }

  /*
    Compliance and audit records.
  */
  if (permission.startsWith("compliance:")) {
    return "compliance";
  }

  return "compliance";
}

/* =========================================================
   ORGANISATION CAPABILITY → PERMISSIONS

   This answers:
   What is the organisation allowed to do overall?

   Important:
   - Capabilities are organisation-level.
   - They do not mean every user can do the action.
   - The active/effective department still needs the same permission.
========================================================= */

const capabilityPermissions: Record<Capability, Permission[]> = {
  generator: [
    /* Templates */
    "template:view",
    "template:create",
    "template:edit",

    /* Listings */
    "listing:view",
    "listing:create",
    "listing:edit",
    "listing:assign",
    "listing:direct_assign",

    /* Assignments */
    "assignment:view",
    "assignment:cancel",

    /*
      Legacy support:
      Keep this for older generator pages that may still check it.
      Current preferred completion flow is manager/receiver receipt.
    */
    "assignment:complete",

    /* Incidents */
    "incident:view",

    /* Shared */
    "team:view",
    "support:view",
    "notification:view",
  ],

  carrier: [
    /* Assignments */
    "assignment:view",
    "assignment:accept",
    "assignment:reject",
    "assignment:verify_collection",

    /* Incidents */
    "incident:view",
    "incident:create",

    /* Shared */
    "team:view",
    "support:view",
    "notification:view",
  ],

  manager: [
    /* Marketplace */
    "marketplace:view",
    "listing:bid",

    /* Assignments */
    "assignment:view",
    "assignment:assign_carrier",
    "assignment:accept",
    "assignment:reject",
    "assignment:receive_waste",
    "assignment:verify_receipt",

    /* Receiving / intake */
    "receiving:view",
    "receiving:create",
    "receiving:update",
    "receiving:submit",

    /* Digital Waste Tracking */
    "dwt:view",
    "dwt:submit_receive_movement",
    "dwt:update_receive_movement",
    "dwt:reference_data:view",

    /* Incidents */
    "incident:view",
    "incident:create",

    /* Shared */
    "team:view",
    "support:view",
    "notification:view",
  ],
};

/* =========================================================
   DEPARTMENT → PERMISSIONS

   This answers:
   What is this user allowed to do from their active/effective department?
========================================================= */

const departmentPermissions: Record<DepartmentType, Permission[]> = {
  generator: [
    /* Templates */
    "template:view",
    "template:create",
    "template:edit",

    /* Listings */
    "listing:view",
    "listing:create",
    "listing:edit",
    "listing:assign",
    "listing:direct_assign",

    /* Assignments */
    "assignment:view",
    "assignment:cancel",

    /*
      Legacy support:
      Keep for older completion checks.
      Current workflow should prefer manager receipt / receive_waste.
    */
    "assignment:complete",

    /* Incidents */
    "incident:view",

    /* Shared */
    "team:view",
    "support:view",
    "notification:view",
  ],

  carrier: [
    /* Assignments */
    "assignment:view",
    "assignment:accept",
    "assignment:reject",
    "assignment:verify_collection",

    /* Incidents */
    "incident:view",
    "incident:create",

    /* Shared */
    "team:view",
    "support:view",
    "notification:view",
  ],

  manager: [
    /* Marketplace */
    "marketplace:view",
    "listing:bid",

    /* Assignments */
    "assignment:view",
    "assignment:assign_carrier",
    "assignment:accept",
    "assignment:reject",
    "assignment:receive_waste",
    "assignment:verify_receipt",

    /* Receiving / intake */
    "receiving:view",
    "receiving:create",
    "receiving:update",
    "receiving:submit",

    /* Digital Waste Tracking */
    "dwt:view",
    "dwt:submit_receive_movement",
    "dwt:update_receive_movement",
    "dwt:reference_data:view",

    /* Incidents */
    "incident:view",
    "incident:create",

    /* Shared */
    "team:view",
    "support:view",
    "notification:view",
  ],

  compliance: [
    /* Read operational records */
    "assignment:view",

    /* Receiving visibility */
    "receiving:view",

    /*
      Compliance can submit/update DWT records because the government
      submission is a formal compliance event.
    */
    "dwt:view",
    "dwt:submit_receive_movement",
    "dwt:update_receive_movement",
    "dwt:reference_data:view",
    "dwt:reference_data:sync",

    /* Incidents */
    "incident:view",
    "incident:resolve",

    /* Compliance */
    "compliance:view",
    "compliance:audit",
    "compliance:reports",

    /* Shared */
    "team:view",
    "support:view",
    "notification:view",
  ],
};

/* =========================================================
   RAW CAPABILITY CHECK

   Checks only the organisation capability layer.
========================================================= */

export function hasPermission(
  capabilities: Capability[],
  permission: Permission,
) {
  return capabilities.some((capability) =>
    capabilityPermissions[capability]?.includes(permission),
  );
}

/* =========================================================
   DEPARTMENT CHECK

   Checks only the active/effective department layer.
========================================================= */

export function departmentHasPermission({
  departmentType,
  permission,
}: {
  departmentType: DepartmentType | null | undefined;
  permission: Permission;
}) {
  if (!departmentType) return false;

  return departmentPermissions[departmentType]?.includes(permission) ?? false;
}

/* =========================================================
   FINAL OPERATIONAL CHECK

   Checks capability + department together.

   Rule:
   - generator / carrier / manager departments need both:
     1. organisation capability
     2. active/effective department permission

   - compliance is internal oversight and does not need to exist
     as an organisation capability.
========================================================= */

export function hasOperationalPermission({
  capabilities,
  departmentType,
  permission,
}: {
  capabilities: Capability[];
  departmentType: DepartmentType | null | undefined;
  permission: Permission;
}) {
  if (!departmentType) return false;

  /*
    Compliance is internal oversight.
    It does not need to exist as an organisation capability.
  */
  if (departmentType === "compliance") {
    return departmentHasPermission({
      departmentType,
      permission,
    });
  }

  return (
    hasPermission(capabilities, permission) &&
    departmentHasPermission({
      departmentType,
      permission,
    })
  );
}

/* =========================================================
   SOLO-AWARE HELPERS

   These are the preferred helpers for new pages/actions.
========================================================= */

export function getEffectiveDepartmentTypeForPermission({
  operatingMode,
  departmentType,
  permission,
}: {
  operatingMode?: OrganisationOperatingMode | string | null;
  departmentType: DepartmentType | null | undefined;
  permission: Permission;
}): DepartmentType | null {
  if (isSoloOperatingMode(operatingMode)) {
    return getSoloEffectiveDepartmentType(permission);
  }

  return departmentType ?? null;
}

export function hasOperationalPermissionForOrganisation({
  capabilities,
  departmentType,
  permission,
  operatingMode,
}: {
  capabilities: Capability[];
  departmentType: DepartmentType | null | undefined;
  permission: Permission;
  operatingMode?: OrganisationOperatingMode | string | null;
}) {
  if (!isSoloOperatingMode(operatingMode)) {
    return hasOperationalPermission({
      capabilities,
      departmentType,
      permission,
    });
  }

  const effectiveCapabilities = getSoloEffectiveCapabilities(capabilities);
  const effectiveDepartmentType = getSoloEffectiveDepartmentType(permission);

  /*
    Compliance does not require a matching organisation capability.
    In solo mode this gives the solo operator compliance oversight powers.
  */
  if (effectiveDepartmentType === "compliance") {
    return departmentHasPermission({
      departmentType: effectiveDepartmentType,
      permission,
    });
  }

  return (
    hasPermission(effectiveCapabilities, permission) &&
    departmentHasPermission({
      departmentType: effectiveDepartmentType,
      permission,
    })
  );
}

/* =========================================================
   OPTIONAL HELPERS

   Useful for debugging, UI cards, and settings pages.
========================================================= */

export function getCapabilityPermissions(capability: Capability): Permission[] {
  return capabilityPermissions[capability] ?? [];
}

export function getDepartmentPermissions(
  departmentType: DepartmentType,
): Permission[] {
  return departmentPermissions[departmentType] ?? [];
}

export function getEffectiveOperationalPermissions({
  capabilities,
  departmentType,
  operatingMode,
}: {
  capabilities: Capability[];
  departmentType: DepartmentType | null | undefined;
  operatingMode?: OrganisationOperatingMode | string | null;
}): Permission[] {
  if (isSoloOperatingMode(operatingMode)) {
    const effectiveCapabilities = getSoloEffectiveCapabilities(capabilities);

    const capabilityAllowed = new Set<Permission>();

    for (const capability of effectiveCapabilities) {
      for (const permission of capabilityPermissions[capability] ?? []) {
        capabilityAllowed.add(permission);
      }
    }

    for (const permission of departmentPermissions.compliance ?? []) {
      capabilityAllowed.add(permission);
    }

    return Array.from(capabilityAllowed);
  }

  if (!departmentType) return [];

  const departmentAllowed = departmentPermissions[departmentType] ?? [];

  if (departmentType === "compliance") {
    return departmentAllowed;
  }

  return departmentAllowed.filter((permission) =>
    hasPermission(capabilities, permission),
  );
}