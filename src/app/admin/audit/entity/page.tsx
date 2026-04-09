import { database } from "@/db/database";
import { auditEvents, users, organisations } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import EntityExplorerClient from "./EntityExplorerClient";

export default async function EntityExplorerPage({
  searchParams,
}: {
  searchParams: {
    entityId?: string;
  };
}) {
  const entityId = searchParams.entityId;

  let events: any[] = [];

  if (entityId) {
    events = await database
      .select({
        id: auditEvents.id,
        action: auditEvents.action,
        entityType: auditEvents.entityType,
        entityId: auditEvents.entityId,
        createdAt: auditEvents.createdAt,
        previousState: auditEvents.previousState,
        newState: auditEvents.newState,

        userName: users.name,
        organisationName: organisations.teamName,
      })
      .from(auditEvents)
      .leftJoin(users, eq(auditEvents.userId, users.id))
      .leftJoin(organisations, eq(auditEvents.organisationId, organisations.id))
      .where(eq(auditEvents.entityId, entityId))
      .orderBy(desc(auditEvents.createdAt));
  }

  return (
    <EntityExplorerClient
      initialEvents={events}
      initialEntityId={entityId || ""}
    />
  );
}
