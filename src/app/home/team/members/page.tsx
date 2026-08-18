import { asc, eq } from "drizzle-orm";

import { database } from "@/db/database";
import { users } from "@/db/schema";
import { requireSoloPermission } from "@/modules/solo-permissions/core/requireSoloPermission";
import { getOrganisationSoloAccess } from "@/modules/solo-permissions/data-access/getSoloUserAccess";

import MembersClient from "./MembersClient";

export default async function MembersPage() {
  const context = await requireSoloPermission("team:view");

  const organisationUsers = await database.query.users.findMany({
    where: eq(users.organisationId, context.organisationId),
    columns: {
      id: true,
      name: true,
      email: true,
      role: true,
      soloAccessPreset: true,
      status: true,
      isActive: true,
      isSuspended: true,
      createdAt: true,
      lastSeenAt: true,
      inviteExpiry: true,
    },
    orderBy: [asc(users.name)],
  });

  // Platform admins belong to /admin, not customer Team & Permissions.
  const customerUsers = organisationUsers.filter(
    (user) => user.role !== "platform_admin",
  );

  const accessByUser = await getOrganisationSoloAccess({
    organisationId: context.organisationId,
    userIds: customerUsers.map((user) => user.id),
  });

  const members = customerUsers.map((user) => {
    const access = accessByUser.get(user.id);

    return {
      ...user,
      effectivePreset: access?.preset ?? fallbackPreset(user.role),
      permissionCount: access?.permissions.length ?? 0,
      isCurrentUser: user.id === context.userId,
    };
  });

  return (
    <MembersClient
      members={members}
      organisationName={context.organisationName}
      canInvite={context.permissions.has("team:invite")}
      canManage={context.permissions.has("team:manage")}
      canManagePermissions={context.permissions.has("permissions:manage")}
    />
  );
}

function fallbackPreset(role: string) {
  if (role === "administrator") return "administrator" as const;
  if (role === "seniorManagement") return "management" as const;
  if (role === "accounts") return "accounts" as const;
  if (role === "read_only") return "read_only" as const;
  return "operations" as const;
}
