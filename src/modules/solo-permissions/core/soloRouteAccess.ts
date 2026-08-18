import { redirect } from "next/navigation";

import type { SoloPermission } from "./permissions";
import {
  getCurrentSoloPermissionContext,
  type CurrentSoloPermissionContext,
} from "./requireSoloPermission";

export type SoloRouteAccessRule =
  | SoloPermission
  | {
      allOf?: SoloPermission[];
      anyOf?: SoloPermission[];
    };

function normaliseRule(rule: SoloRouteAccessRule) {
  if (typeof rule === "string") {
    return {
      allOf: [rule],
      anyOf: [] as SoloPermission[],
    };
  }

  return {
    allOf: rule.allOf ?? [],
    anyOf: rule.anyOf ?? [],
  };
}

export async function requireSoloRouteAccess(
  rule: SoloRouteAccessRule,
): Promise<CurrentSoloPermissionContext> {
  const context = await getCurrentSoloPermissionContext();
  const { allOf, anyOf } = normaliseRule(rule);

  const passesAll =
    allOf.length === 0 ||
    allOf.every((permission) => context.permissions.has(permission));

  const passesAny =
    anyOf.length === 0 ||
    anyOf.some((permission) => context.permissions.has(permission));

  if (!passesAll || !passesAny) {
    const denied = [...allOf, ...anyOf].join(",");

    redirect(
      `/home?reason=permission_denied&permission=${encodeURIComponent(denied)}`,
    );
  }

  return context;
}

export function hasSoloPermission(
  context: Pick<CurrentSoloPermissionContext, "permissions">,
  permission: SoloPermission,
) {
  return context.permissions.has(permission);
}

export function hasAnySoloPermission(
  context: Pick<CurrentSoloPermissionContext, "permissions">,
  permissions: SoloPermission[],
) {
  return permissions.some((permission) =>
    context.permissions.has(permission),
  );
}

export function hasAllSoloPermissions(
  context: Pick<CurrentSoloPermissionContext, "permissions">,
  permissions: SoloPermission[],
) {
  return permissions.every((permission) =>
    context.permissions.has(permission),
  );
}
