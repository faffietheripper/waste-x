// src/app/admin/audit/entity/page.tsx

import { database } from "@/db/database";
import { auditEvents, organisations, users } from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";
import { desc, eq } from "drizzle-orm";

import EntityExplorerClient from "./EntityExplorerClient";

type EntityExplorerSearchParams =
  | {
      entityId?: string;
    }
  | Promise<{
      entityId?: string;
    }>;

export default async function EntityExplorerPage({
  searchParams,
}: {
  searchParams: EntityExplorerSearchParams;
}) {
  await requirePlatformAdmin();

  const resolvedSearchParams = await searchParams;

  const entityId = resolvedSearchParams.entityId?.trim() ?? "";

  const events = entityId
    ? await database
        .select({
          id: auditEvents.id,
          action: auditEvents.action,
          entityType: auditEvents.entityType,
          entityId: auditEvents.entityId,
          createdAt: auditEvents.createdAt,
          previousState: auditEvents.previousState,
          newState: auditEvents.newState,

          userName: users.name,
          userEmail: users.email,

          organisationName: organisations.teamName,
          organisationId: organisations.id,
        })
        .from(auditEvents)
        .leftJoin(users, eq(auditEvents.userId, users.id))
        .leftJoin(organisations, eq(auditEvents.organisationId, organisations.id))
        .where(eq(auditEvents.entityId, entityId))
        .orderBy(desc(auditEvents.createdAt))
    : [];

  const serialisedEvents = events.map((event) => ({
    ...event,
    createdAt: event.createdAt ? event.createdAt.toISOString() : null,
  }));

  return (
    <EntityExplorerClient
      initialEvents={serialisedEvents}
      initialEntityId={entityId}
    />
  );
}