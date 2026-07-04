import { database } from "@/db/database";
import { auditEvents, organisations, users } from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";
import { desc, eq, inArray } from "drizzle-orm";

import { AuditFeed } from "./AuditFeed";

type LiveAuditSearchParams =
  | {
      action?: string;
      page?: string;
    }
  | Promise<{
      action?: string;
      page?: string;
    }>;

export default async function LiveAuditPage({
  searchParams,
}: {
  searchParams: LiveAuditSearchParams;
}) {
  await requirePlatformAdmin();

  const resolvedSearchParams = await searchParams;

  const page = Math.max(Number(resolvedSearchParams.page || "1"), 1);
  const limit = 20;
  const offset = (page - 1) * limit;

  const selectedActions = resolvedSearchParams.action
    ? resolvedSearchParams.action
        .split(",")
        .map((action) => action.trim())
        .filter(Boolean)
    : [];

  const events = await database
    .select({
      id: auditEvents.id,
      action: auditEvents.action,
      entityType: auditEvents.entityType,
      entityId: auditEvents.entityId,
      createdAt: auditEvents.createdAt,

      userName: users.name,
      userEmail: users.email,

      organisationName: organisations.teamName,
      organisationId: organisations.id,
    })
    .from(auditEvents)
    .leftJoin(users, eq(auditEvents.userId, users.id))
    .leftJoin(organisations, eq(auditEvents.organisationId, organisations.id))
    .where(
      selectedActions.length > 0
        ? inArray(auditEvents.action, selectedActions)
        : undefined,
    )
    .orderBy(desc(auditEvents.createdAt))
    .limit(limit)
    .offset(offset);

  const mappedEvents = events.map((event) => ({
    ...event,
    createdAt: event.createdAt ? event.createdAt.toISOString() : null,
  }));

  return (
    <AuditFeed
      events={mappedEvents}
      page={page}
      limit={limit}
      selectedActions={selectedActions}
      lastUpdatedAt={new Date().toISOString()}
    />
  );
}