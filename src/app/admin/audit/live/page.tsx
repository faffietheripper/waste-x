import { database } from "@/db/database";
import { auditEvents, users, organisations } from "@/db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { AuditFeed } from "./AuditFeed";

export default async function LiveAuditPage({
  searchParams,
}: {
  searchParams: {
    action?: string;
    page?: string;
  };
}) {
  const page = Number(searchParams.page || "1");
  const limit = 20;
  const offset = (page - 1) * limit;

  const selectedActions = searchParams.action
    ? searchParams.action.split(",")
    : null;

  const events = await database
    .select({
      id: auditEvents.id,
      action: auditEvents.action,
      entityType: auditEvents.entityType,
      entityId: auditEvents.entityId,
      createdAt: auditEvents.createdAt,

      userName: users.name,
      organisationName: organisations.teamName,
    })
    .from(auditEvents)
    .leftJoin(users, eq(auditEvents.userId, users.id))
    .leftJoin(organisations, eq(auditEvents.organisationId, organisations.id))
    .where(
      selectedActions
        ? inArray(auditEvents.action, selectedActions)
        : undefined,
    )
    .orderBy(desc(auditEvents.createdAt))
    .limit(limit)
    .offset(offset);

  return (
    <AuditFeed
      events={events}
      page={page}
      selectedActions={selectedActions || []}
    />
  );
}
