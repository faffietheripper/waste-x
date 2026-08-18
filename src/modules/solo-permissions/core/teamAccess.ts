import { and, eq } from "drizzle-orm";

import { database } from "@/db/database";
import { users } from "@/db/schema";

import type { SoloPermission } from "./permissions";
import { getOrganisationSoloAccess } from "../data-access/getSoloUserAccess";

export async function getActivePermissionManagers(params: {
  organisationId: string;
  excludeUserId?: string;
}) {
  const members = await database.query.users.findMany({
    where: and(
      eq(users.organisationId, params.organisationId),
      eq(users.isActive, true),
      eq(users.isSuspended, false),
    ),
    columns: {
      id: true,
      status: true,
    },
  });

  const candidates = members.filter(
    (member) =>
      member.status === "ACTIVE" &&
      member.id !== params.excludeUserId,
  );

  const accessByUser = await getOrganisationSoloAccess({
    organisationId: params.organisationId,
    userIds: candidates.map((member) => member.id),
  });

  return candidates.filter((member) =>
    accessByUser
      .get(member.id)
      ?.permissions.includes("permissions:manage" as SoloPermission),
  );
}

export async function organisationHasOtherPermissionManager(params: {
  organisationId: string;
  targetUserId: string;
}) {
  const others = await getActivePermissionManagers({
    organisationId: params.organisationId,
    excludeUserId: params.targetUserId,
  });

  return others.length > 0;
}
