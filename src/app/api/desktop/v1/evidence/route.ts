import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { clientEvidenceUploads } from "@/db/client-sync-schema";
import { database } from "@/db/database";
import { jobLoads, jobs } from "@/db/schema";
import { env } from "@/env";
import {
  requireClientApiContext,
  requireOperationsRole,
} from "@/lib/client-api/auth";
import { recordSyncChange } from "@/lib/client-api/change-feed";
import {
  clientApiError,
  clientApiJson,
  handleClientApiError,
} from "@/lib/client-api/http";

export const dynamic = "force-dynamic";

const MAX_EVIDENCE_BYTES = 50 * 1024 * 1024;
const URL_TTL_SECONDS = 15 * 60;

const allowedContentTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
]);

const initiateSchema = z.object({
  evidenceId: z.string().uuid(),
  siteId: z.string().min(1).nullable().optional(),
  entityType: z.enum(["job", "job_load"]),
  entityId: z.string().min(1),
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(120),
  byteSize: z.number().int().positive().max(MAX_EVIDENCE_BYTES),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
});

const completeSchema = z.object({
  evidenceId: z.string().uuid(),
});

function storageClient() {
  return new S3Client({
    region: "auto",
    endpoint: `https://${env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.CLOUDFLARE_ACCESS_KEY_ID,
      secretAccessKey: env.CLOUDFLARE_SECRET_ACCESS_KEY,
    },
  });
}

function safeFileName(fileName: string) {
  const clean = fileName
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-120);

  return clean || "evidence-file";
}

async function entityBelongsToOrganisation(
  organisationId: string,
  entityType: "job" | "job_load",
  entityId: string,
) {
  if (entityType === "job") {
    const job = await database.query.jobs.findFirst({
      where: and(
        eq(jobs.id, entityId),
        eq(jobs.organisationId, organisationId),
      ),
      columns: { id: true },
    });
    return Boolean(job);
  }

  const load = await database.query.jobLoads.findFirst({
    where: and(
      eq(jobLoads.id, entityId),
      eq(jobLoads.organisationId, organisationId),
    ),
    columns: { id: true },
  });
  return Boolean(load);
}

export async function POST(request: Request) {
  try {
    const context = await requireClientApiContext(request);
    requireOperationsRole(context);

    const parsed = initiateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return clientApiError(
        "INVALID_EVIDENCE_REQUEST",
        400,
        "Evidence upload details are invalid.",
        parsed.error.flatten(),
      );
    }

    if (!allowedContentTypes.has(parsed.data.contentType)) {
      return clientApiError(
        "UNSUPPORTED_EVIDENCE_TYPE",
        400,
        "This evidence file type is not supported.",
      );
    }

    const exists = await entityBelongsToOrganisation(
      context.organisationId,
      parsed.data.entityType,
      parsed.data.entityId,
    );

    if (!exists) {
      return clientApiError(
        "EVIDENCE_ENTITY_NOT_FOUND",
        404,
        "The Waste X record for this evidence was not found.",
      );
    }

    const existing = await database.query.clientEvidenceUploads.findFirst({
      where: eq(clientEvidenceUploads.evidenceId, parsed.data.evidenceId),
    });

    if (existing) {
      if (
        existing.organisationId !== context.organisationId ||
        existing.sha256.toLowerCase() !== parsed.data.sha256.toLowerCase()
      ) {
        return clientApiError(
          "EVIDENCE_ID_REUSED",
          409,
          "This evidence identifier has already been used.",
        );
      }

      if (existing.status === "UPLOADED") {
        return clientApiJson({
          ok: true,
          evidence: existing,
          alreadyUploaded: true,
        });
      }
    }

    const storageKey = existing?.storageKey ??
      `client-evidence/${context.organisationId}/${parsed.data.entityType}/${parsed.data.entityId}/${parsed.data.evidenceId}/${safeFileName(parsed.data.fileName)}`;

    if (!existing) {
      await database.insert(clientEvidenceUploads).values({
        evidenceId: parsed.data.evidenceId,
        organisationId: context.organisationId,
        siteId: parsed.data.siteId ?? context.defaultSiteId,
        deviceId: context.deviceId,
        userId: context.userId,
        entityType: parsed.data.entityType,
        entityId: parsed.data.entityId,
        fileName: parsed.data.fileName,
        contentType: parsed.data.contentType,
        byteSize: parsed.data.byteSize,
        sha256: parsed.data.sha256.toLowerCase(),
        storageKey,
        status: "PENDING_UPLOAD",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    const uploadUrl = await getSignedUrl(
      storageClient(),
      new PutObjectCommand({
        Bucket: env.BUCKET_NAME,
        Key: storageKey,
        ContentType: parsed.data.contentType,
        Metadata: {
          "waste-x-evidence-id": parsed.data.evidenceId,
          "waste-x-sha256": parsed.data.sha256.toLowerCase(),
        },
      }),
      { expiresIn: URL_TTL_SECONDS },
    );

    return clientApiJson({
      ok: true,
      evidenceId: parsed.data.evidenceId,
      upload: {
        method: "PUT",
        url: uploadUrl,
        contentType: parsed.data.contentType,
        expiresInSeconds: URL_TTL_SECONDS,
      },
    });
  } catch (error) {
    return handleClientApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await requireClientApiContext(request);
    requireOperationsRole(context);

    const parsed = completeSchema.safeParse(await request.json());
    if (!parsed.success) {
      return clientApiError(
        "INVALID_EVIDENCE_REQUEST",
        400,
        "Evidence completion details are invalid.",
      );
    }

    const evidence = await database.query.clientEvidenceUploads.findFirst({
      where: and(
        eq(clientEvidenceUploads.evidenceId, parsed.data.evidenceId),
        eq(clientEvidenceUploads.organisationId, context.organisationId),
      ),
    });

    if (!evidence) {
      return clientApiError(
        "EVIDENCE_NOT_FOUND",
        404,
        "This evidence upload was not found.",
      );
    }

    if (evidence.status === "UPLOADED") {
      return clientApiJson({ ok: true, evidence, alreadyUploaded: true });
    }

    const head = await storageClient().send(
      new HeadObjectCommand({
        Bucket: env.BUCKET_NAME,
        Key: evidence.storageKey,
      }),
    );

    if (
      typeof head.ContentLength === "number" &&
      head.ContentLength !== evidence.byteSize
    ) {
      return clientApiError(
        "EVIDENCE_SIZE_MISMATCH",
        409,
        "The uploaded evidence file does not match the expected size.",
      );
    }

    const now = new Date();
    const [updated] = await database
      .update(clientEvidenceUploads)
      .set({ status: "UPLOADED", uploadedAt: now, updatedAt: now })
      .where(eq(clientEvidenceUploads.evidenceId, evidence.evidenceId))
      .returning();

    await recordSyncChange({
      organisationId: context.organisationId,
      siteId: evidence.siteId,
      entityType: "evidence",
      entityId: evidence.evidenceId,
      payload: updated,
    });

    return clientApiJson({ ok: true, evidence: updated });
  } catch (error) {
    return handleClientApiError(error);
  }
}
