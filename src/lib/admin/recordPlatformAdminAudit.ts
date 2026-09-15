import { auth } from "@/auth";
import { database } from "@/db/database";
import { auditEvents, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";

type AuditState = Record<string, unknown>;

type RecordPlatformAdminAuditInput = {
  organisationId: string;
  entityType: string;
  entityId: string;
  action: string;
  previousState?: AuditState | null;
  newState?: AuditState | null;
};

/*
  Privacy boundary for Platform Admin audit metadata.

  The audit trail is intentionally NOT a place to copy:
  - passwords / credentials
  - auth or refresh tokens
  - device secrets or hashes
  - raw request/response bodies
  - DWT/sync payloads
  - support message bodies
  - customer file contents

  Call sites should pass small operational state summaries only. This helper
  also strips suspicious keys defensively before serialisation.
*/
const FORBIDDEN_AUDIT_KEY =
  /(password|passwd|secret|token|authorization|cookie|session|hash|payload|body|message|content|file)/i;

const MAX_STRING_LENGTH = 240;
const MAX_STATE_LENGTH = 4000;

function sanitiseAuditValue(value: unknown, depth = 0): unknown {
  if (value === null) return null;

  if (typeof value === "boolean" || typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return value.trim().slice(0, MAX_STRING_LENGTH);
  }

  if (depth >= 2) return undefined;

  if (Array.isArray(value)) {
    return value
      .slice(0, 25)
      .map((item) => sanitiseAuditValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }

  if (typeof value === "object") {
    const safe: Record<string, unknown> = {};

    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_AUDIT_KEY.test(key)) continue;

      const sanitised = sanitiseAuditValue(raw, depth + 1);
      if (sanitised !== undefined) safe[key] = sanitised;
    }

    return safe;
  }

  return undefined;
}

function serialiseAuditState(value: AuditState | null | undefined) {
  if (!value) return null;

  const sanitised = sanitiseAuditValue(value);
  if (!sanitised) return null;

  return JSON.stringify(sanitised).slice(0, MAX_STATE_LENGTH);
}

export async function recordPlatformAdminAuditEvent(
  input: RecordPlatformAdminAuditInput,
) {
  const session = await auth();
  const actorUserId = session?.user?.id;

  if (!actorUserId) {
    throw new Error("Platform admin audit actor is unavailable.");
  }

  const actor = await database.query.users.findFirst({
    where: and(
      eq(users.id, actorUserId),
      eq(users.role, "platform_admin"),
    ),
    columns: {
      id: true,
      isActive: true,
      isSuspended: true,
    },
  });

  if (!actor || !actor.isActive || actor.isSuspended) {
    throw new Error("Platform admin audit actor is unavailable.");
  }

  await database.insert(auditEvents).values({
    organisationId: input.organisationId,
    userId: actor.id,
    entityType: input.entityType.slice(0, 120),
    entityId: input.entityId.slice(0, 200),
    action: input.action.slice(0, 160),
    previousState: serialiseAuditState(input.previousState),
    newState: serialiseAuditState(input.newState),
    // Deliberately avoid collecting additional network PII for routine Admin
    // actions. If a future break-glass workflow needs network attribution,
    // it should be explicit and separately reviewed.
    ipAddress: null,
  });
}
