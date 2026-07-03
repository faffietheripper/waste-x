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

export type Permission =
  /* Listings owned by generator */
  | "listing:view"
  | "listing:create"
  | "listing:edit"
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

  /* Digital Waste Tracking / Defra integration */
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
   ORGANISATION CAPABILITY → PERMISSIONS
   This answers: what is the company allowed to do overall?

   Important:
   - Capabilities are organisation-level.
   - They do not mean every user in the organisation can perform the action.
   - Department permissions still need to match.
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
    "listing:direct_assign",

    /* Assignments */
    "assignment:view",
    "assignment:cancel",

    /*
      Legacy support:
      Keep this for now in case older generator pages still check it.
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
   This answers: what this user is allowed to do right now?

   Important:
   - Department type is the active operational perspective.
   - Organisation can have many capabilities, but active department
     controls what the current user can actually do.
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
    "listing:direct_assign",

    /* Assignments */
    "assignment:view",
    "assignment:cancel",

    /*
      Legacy support:
      Keep for older completion checks.
      Current workflow should prefer manager receipt/receive_waste.
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
      If you later want compliance to be view-only, remove:
      - dwt:submit_receive_movement
      - dwt:update_receive_movement
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
   Checks only the active department layer.
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
     2. active department permission

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
    A compliance department can review and manage compliance records
    for its organisation, but it cannot perform generator/carrier/manager
    operational work unless explicitly listed in compliance permissions.
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
}: {
  capabilities: Capability[];
  departmentType: DepartmentType | null | undefined;
}): Permission[] {
  if (!departmentType) return [];

  const departmentAllowed = departmentPermissions[departmentType] ?? [];

  if (departmentType === "compliance") {
    return departmentAllowed;
  }

  return departmentAllowed.filter((permission) =>
    hasPermission(capabilities, permission),
  );
}