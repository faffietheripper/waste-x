import { and, eq, inArray } from "drizzle-orm";

import { database } from "@/db/database";
import { userPermissions, users } from "@/db/schema";

import {
  SOLO_PERMISSIONS,
  type SoloAccessPreset,
  type SoloPermission,
  type SoloPermissionEffect,
} from "../core/permissions";
import {
  getDefaultPresetForRole,
  getPresetPermissions,
} from "../core/presets";

export type SoloPermissionOverride = {
  permission: SoloPermission;
  effect: SoloPermissionEffect;
};

export type SoloUserAccessSnapshot = {
  userId: string;
  organisationId: string;
  role: string;
  preset: SoloAccessPreset;
  permissions: SoloPermission[];
  overrides: SoloPermissionOverride[];
};

function resolvePreset(params: {
  storedPreset: string | null | undefined;
  role: string;
}): SoloAccessPreset {
  // Administrator is always the administrator preset in Solo.
  if (params.role === "administrator") return "administrator";

  const stored = params.storedPreset;

  if (
    stored === "management" ||
    stored === "operations" ||
    stored === "compliance" ||
    stored === "accounts" ||
    stored === "read_only" ||
    stored === "custom"
  ) {
    return stored;
  }

  return getDefaultPresetForRole(params.role);
}

function resolveEffectivePermissions(params: {
  role: string;
  preset: SoloAccessPreset;
  overrides: SoloPermissionOverride[];
}) {
  // Customer administrators are immutable full-access users.
  if (params.role === "administrator") {
    return Array.from(getPresetPermissions("administrator"));
  }

  const effective = getPresetPermissions(params.preset);

  for (const override of params.overrides) {
    if (override.effect === "allow") effective.add(override.permission);
    else effective.delete(override.permission);
  }

  return Array.from(effective);
}

export async function getSoloUserAccess(params: {
  organisationId: string;
  userId: string;
}): Promise<SoloUserAccessSnapshot | null> {
  const user = await database.query.users.findFirst({
    where: and(
      eq(users.id, params.userId),
      eq(users.organisationId, params.organisationId),
    ),
    columns: {
      id: true,
      organisationId: true,
      role: true,
      soloAccessPreset: true,
    },
  });

  if (!user?.organisationId) return null;
  if (user.role === "platform_admin") return null;

  const rows = await database
    .select({
      permission: userPermissions.permission,
      effect: userPermissions.effect,
    })
    .from(userPermissions)
    .where(
      and(
        eq(userPermissions.organisationId, params.organisationId),
        eq(userPermissions.userId, params.userId),
      ),
    );

  const validPermissions = new Set<string>(SOLO_PERMISSIONS);

  const overrides = rows
    .filter((row) => validPermissions.has(row.permission))
    .map((row) => ({
      permission: row.permission as SoloPermission,
      effect: row.effect as SoloPermissionEffect,
    }));

  const preset = resolvePreset({
    storedPreset: user.soloAccessPreset,
    role: user.role,
  });

  return {
    userId: user.id,
    organisationId: user.organisationId,
    role: user.role,
    preset,
    permissions: resolveEffectivePermissions({
      role: user.role,
      preset,
      overrides,
    }),
    overrides,
  };
}

export async function getOrganisationSoloAccess(params: {
  organisationId: string;
  userIds: string[];
}) {
  if (params.userIds.length === 0) {
    return new Map<string, SoloUserAccessSnapshot>();
  }

  const organisationUsers = await database.query.users.findMany({
    where: and(
      eq(users.organisationId, params.organisationId),
      inArray(users.id, params.userIds),
    ),
    columns: {
      id: true,
      organisationId: true,
      role: true,
      soloAccessPreset: true,
    },
  });

  const customerUsers = organisationUsers.filter(
    (user) => user.role !== "platform_admin",
  );

  if (customerUsers.length === 0) {
    return new Map<string, SoloUserAccessSnapshot>();
  }

  const customerUserIds = customerUsers.map((user) => user.id);

  const overrideRows = await database
    .select({
      userId: userPermissions.userId,
      permission: userPermissions.permission,
      effect: userPermissions.effect,
    })
    .from(userPermissions)
    .where(
      and(
        eq(userPermissions.organisationId, params.organisationId),
        inArray(userPermissions.userId, customerUserIds),
      ),
    );

  const overridesByUser = new Map<string, SoloPermissionOverride[]>();
  const validPermissions = new Set<string>(SOLO_PERMISSIONS);

  for (const row of overrideRows) {
    if (!validPermissions.has(row.permission)) continue;

    const existing = overridesByUser.get(row.userId) ?? [];
    existing.push({
      permission: row.permission as SoloPermission,
      effect: row.effect as SoloPermissionEffect,
    });
    overridesByUser.set(row.userId, existing);
  }

  const result = new Map<string, SoloUserAccessSnapshot>();

  for (const user of customerUsers) {
    if (!user.organisationId) continue;

    const overrides = overridesByUser.get(user.id) ?? [];
    const preset = resolvePreset({
      storedPreset: user.soloAccessPreset,
      role: user.role,
    });

    result.set(user.id, {
      userId: user.id,
      organisationId: user.organisationId,
      role: user.role,
      preset,
      permissions: resolveEffectivePermissions({
        role: user.role,
        preset,
        overrides,
      }),
      overrides,
    });
  }

  return result;
}
