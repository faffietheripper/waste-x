export type Capability = "generator" | "carrier" | "manager";

type Permission =
  | "template:create"
  | "template:edit"
  | "listing:create"
  | "listing:bid"
  | "listing:assign"
  | "listing:direct_assign";

/* =========================================================
   CAPABILITY → PERMISSIONS MAP
========================================================= */

const capabilityPermissions: Record<Capability, Permission[]> = {
  generator: [
    "template:create",
    "template:edit",
    "listing:create",
    "listing:direct_assign",
  ],

  carrier: ["listing:bid"],

  manager: [
    "template:create",
    "template:edit",
    "listing:create",
    "listing:bid",
    "listing:assign",
    "listing:direct_assign",
  ],
};

/* =========================================================
   CHECK
========================================================= */

export function hasPermission(
  capabilities: Capability[],
  permission: Permission,
) {
  return capabilities.some((cap) =>
    capabilityPermissions[cap]?.includes(permission),
  );
}
