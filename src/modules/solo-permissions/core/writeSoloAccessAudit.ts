import { database } from "@/db/database";
import { auditEvents } from "@/db/schema";

export async function writeSoloAccessAudit(params: {
  organisationId: string;
  actorUserId: string;
  targetUserId: string;
  action:
    | "USER_INVITED"
    | "USER_ACCESS_CHANGED"
    | "USER_SUSPENDED"
    | "USER_REACTIVATED"
    | "USER_INVITE_CANCELLED"
    | "USER_INVITE_RESENT";
  previousState?: unknown;
  newState?: unknown;
}) {
  await database.insert(auditEvents).values({
    organisationId: params.organisationId,
    userId: params.actorUserId,
    entityType: "user",
    entityId: params.targetUserId,
    action: params.action,
    previousState:
      params.previousState === undefined
        ? null
        : JSON.stringify(params.previousState),
    newState:
      params.newState === undefined
        ? null
        : JSON.stringify(params.newState),
    createdAt: new Date(),
  });
}
