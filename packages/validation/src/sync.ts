import { z } from "zod";

const sha256HexSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/i, "Expected a SHA-256 hex digest.");

export const syncEventV1Schema = z.object({
  schemaVersion: z.literal(1),
  eventId: z.string().uuid(),
  organisationId: z.string().min(1),
  siteId: z.string().min(1).nullable(),
  deviceId: z.string().uuid(),
  actorUserId: z.string().min(1),
  entityType: z.enum([
    "job",
    "job_load",
    "ticket",
    "evidence",
    "operational_event",
  ]),
  entityId: z.string().min(1),
  eventType: z.string().min(1),
  baseVersion: z.number().int().nonnegative().nullable(),
  deviceSequence: z.number().int().positive(),
  occurredAt: z.string().datetime({ offset: true }),
  recordedAt: z.string().datetime({ offset: true }),
  payload: z.unknown(),
  payloadHash: sha256HexSchema,
});

export const syncPushRequestV1Schema = z.object({
  protocolVersion: z.literal(1),
  deviceId: z.string().uuid(),
  batchId: z.string().min(1),
  events: z.array(syncEventV1Schema).min(1).max(250),
});

export const syncPullRequestV1Schema = z.object({
  protocolVersion: z.literal(1),
  deviceId: z.string().uuid(),
  cursor: z.string().nullable(),
  limit: z.number().int().min(1).max(1000).optional(),
});
