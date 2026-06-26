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
   This answers: what is the company allowed to do?
========================================================= */

const capabilityPermissions: Record<Capability, Permission[]> = {
  generator: [
    "template:view",
    "template:create",
    "template:edit",

    "listing:view",
    "listing:create",
    "listing:edit",
    "listing:direct_assign",

    "assignment:view",
    "assignment:cancel",
    "assignment:complete",

    "incident:view",

    "team:view",
    "support:view",
    "notification:view",
  ],

  carrier: [
    "assignment:view",
    "assignment:accept",
    "assignment:reject",
    "assignment:verify_collection",

    "incident:view",
    "incident:create",

    "team:view",
    "support:view",
    "notification:view",
  ],

  manager: [
    "marketplace:view",
    "listing:bid",

    "assignment:view",
    "assignment:assign_carrier",
    "assignment:accept",
    "assignment:reject",
    "assignment:receive_waste",
    "assignment:verify_receipt",

    "incident:view",
    "incident:create",

    "team:view",
    "support:view",
    "notification:view",
  ],
};

/* =========================================================
   DEPARTMENT → PERMISSIONS
   This answers: what this user is allowed to do right now
========================================================= */

const departmentPermissions: Record<DepartmentType, Permission[]> = {
  generator: [
    "template:view",
    "template:create",
    "template:edit",

    "listing:view",
    "listing:create",
    "listing:edit",
    "listing:direct_assign",

    "assignment:view",
    "assignment:cancel",
    "assignment:complete",

    "incident:view",

    "team:view",
    "support:view",
    "notification:view",
  ],

  carrier: [
    "assignment:view",
    "assignment:accept",
    "assignment:reject",
    "assignment:verify_collection",

    "incident:view",
    "incident:create",

    "team:view",
    "support:view",
    "notification:view",
  ],

  manager: [
    "marketplace:view",
    "listing:bid",

    "assignment:view",
    "assignment:assign_carrier",
    "assignment:accept",
    "assignment:reject",
    "assignment:receive_waste",
    "assignment:verify_receipt",

    "incident:view",
    "incident:create",

    "team:view",
    "support:view",
    "notification:view",
  ],

  compliance: [
    "assignment:view",

    "incident:view",
    "incident:resolve",

    "compliance:view",
    "compliance:audit",
    "compliance:reports",

    "team:view",
    "support:view",
    "notification:view",
  ],
};

/* =========================================================
   RAW CAPABILITY CHECK
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
    A compliance department can review records for its organisation,
    but it cannot perform operational work like bidding or creating listings.
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