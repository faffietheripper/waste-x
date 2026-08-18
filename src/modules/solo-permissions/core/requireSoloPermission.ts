import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { database } from "@/db/database";
import { users } from "@/db/schema";

import {
  SOLO_PERMISSIONS,
  type SoloPermission,
} from "./permissions";
import { getSoloUserAccess } from "../data-access/getSoloUserAccess";

export type CurrentSoloPermissionContext = {
  userId: string;
  userName: string;
  organisationId: string;
  organisationName: string;
  role: string;
  permissions: Set<SoloPermission>;
};

export async function getCurrentSoloPermissionContext(): Promise<CurrentSoloPermissionContext> {
  const session = await auth();

  if (!session?.user?.id) redirect("/login");

  const currentUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    with: { organisation: true },
  });

  if (!currentUser) redirect("/login");

  // Platform Admin is a separate Waste X role. It does not become a
  // customer organisation administrator inside the Solo Workspace.
  if (currentUser.role === "platform_admin") {
    redirect("/admin");
  }

  if (!currentUser.organisationId || !currentUser.organisation) {
    redirect("/home/settings/organisation?reason=no-organisation");
  }

  if (
    !currentUser.isActive ||
    currentUser.isSuspended ||
    currentUser.status === "SUSPENDED"
  ) {
    redirect("/login?reason=account_suspended");
  }

  // Customer organisation Administrator is always full-access in Solo.
  // This bypasses any stale preset/override rows.
  if (currentUser.role === "administrator") {
    return {
      userId: currentUser.id,
      userName: currentUser.name,
      organisationId: currentUser.organisationId,
      organisationName: currentUser.organisation.teamName,
      role: currentUser.role,
      permissions: new Set<SoloPermission>(SOLO_PERMISSIONS),
    };
  }

  const access = await getSoloUserAccess({
    organisationId: currentUser.organisationId,
    userId: currentUser.id,
  });

  if (!access) redirect("/home?reason=access_unavailable");

  return {
    userId: currentUser.id,
    userName: currentUser.name,
    organisationId: currentUser.organisationId,
    organisationName: currentUser.organisation.teamName,
    role: currentUser.role,
    permissions: new Set(access.permissions),
  };
}

export async function requireSoloPermission(
  permission: SoloPermission,
): Promise<CurrentSoloPermissionContext> {
  const context = await getCurrentSoloPermissionContext();

  if (!context.permissions.has(permission)) {
    redirect(
      `/home?reason=permission_denied&permission=${encodeURIComponent(permission)}`,
    );
  }

  return context;
}

export function canSolo(
  permissions: Set<SoloPermission> | SoloPermission[],
  permission: SoloPermission,
) {
  return permissions instanceof Set
    ? permissions.has(permission)
    : permissions.includes(permission);
}
