import {
  and,
  desc,
  eq,
  ilike,
  inArray,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";

import { clientEvidenceUploads } from "@/db/client-sync-schema";
import { database } from "@/db/database";
import { jobLoads, jobs, organisations } from "@/db/schema";
import {
  requireClientApiContext,
  requireOperationsRole,
} from "@/lib/client-api/auth";
import {
  clientApiError,
  clientApiJson,
  handleClientApiError,
} from "@/lib/client-api/http";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  q: z.string().trim().max(160).default(""),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export async function GET(request: Request) {
  try {
    const context = await requireClientApiContext(request);
    requireOperationsRole(context);

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      q: url.searchParams.get("q") ?? "",
      offset: url.searchParams.get("offset") ?? "0",
      limit: url.searchParams.get("limit") ?? "50",
    });

    if (!parsed.success) {
      return clientApiError(
        "INVALID_ORGANISATION_CATALOGUE_QUERY",
        400,
        "The organisation catalogue query is invalid.",
      );
    }

    const { q, offset, limit } = parsed.data;
    const pattern = `%${q}%`;
    const baseJobWhere = eq(jobs.organisationId, context.organisationId);
    const jobWhere = q
      ? and(
          baseJobWhere,
          or(
            ilike(jobs.jobNumber, pattern),
            ilike(jobs.status, pattern),
            ilike(jobs.direction, pattern),
          ),
        )
      : baseJobWhere;

    const [organisation, jobCountRows, evidenceCountRows, jobRows, evidenceRows] =
      await Promise.all([
        database.query.organisations.findFirst({
          where: eq(organisations.id, context.organisationId),
          columns: { id: true, teamName: true, status: true },
        }),
        database
          .select({ count: sql<number>`count(*)` })
          .from(jobs)
          .where(jobWhere),
        database
          .select({ count: sql<number>`count(*)` })
          .from(clientEvidenceUploads)
          .where(
            q
              ? and(
                  eq(clientEvidenceUploads.organisationId, context.organisationId),
                  or(
                    ilike(clientEvidenceUploads.fileName, pattern),
                    ilike(clientEvidenceUploads.entityType, pattern),
                    ilike(clientEvidenceUploads.entityId, pattern),
                  ),
                )
              : eq(clientEvidenceUploads.organisationId, context.organisationId),
          ),
        database
          .select()
          .from(jobs)
          .where(jobWhere)
          .orderBy(desc(jobs.jobDate), desc(jobs.jobNumber))
          .limit(limit + 1)
          .offset(offset),
        database
          .select({
            evidenceId: clientEvidenceUploads.evidenceId,
            entityType: clientEvidenceUploads.entityType,
            entityId: clientEvidenceUploads.entityId,
            fileName: clientEvidenceUploads.fileName,
            contentType: clientEvidenceUploads.contentType,
            byteSize: clientEvidenceUploads.byteSize,
            sha256: clientEvidenceUploads.sha256,
            status: clientEvidenceUploads.status,
            uploadedAt: clientEvidenceUploads.uploadedAt,
            createdAt: clientEvidenceUploads.createdAt,
          })
          .from(clientEvidenceUploads)
          .where(
            q
              ? and(
                  eq(clientEvidenceUploads.organisationId, context.organisationId),
                  or(
                    ilike(clientEvidenceUploads.fileName, pattern),
                    ilike(clientEvidenceUploads.entityType, pattern),
                    ilike(clientEvidenceUploads.entityId, pattern),
                  ),
                )
              : eq(clientEvidenceUploads.organisationId, context.organisationId),
          )
          .orderBy(desc(clientEvidenceUploads.createdAt))
          .limit(limit)
          .offset(offset),
      ]);

    const hasMoreJobs = jobRows.length > limit;
    const pageJobs = hasMoreJobs ? jobRows.slice(0, limit) : jobRows;
    const jobIds = pageJobs.map((job) => job.id);
    const loads = jobIds.length
      ? await database
          .select()
          .from(jobLoads)
          .where(
            and(
              eq(jobLoads.organisationId, context.organisationId),
              inArray(jobLoads.jobId, jobIds),
            ),
          )
          .orderBy(desc(jobLoads.jobId), desc(jobLoads.loadNumber))
      : [];

    return clientApiJson({
      ok: true,
      organisation,
      query: q,
      offset,
      limit,
      totals: {
        jobs: Number(jobCountRows[0]?.count ?? 0),
        evidence: Number(evidenceCountRows[0]?.count ?? 0),
      },
      jobs: pageJobs,
      jobLoads: loads,
      evidence: evidenceRows,
      hasMoreJobs,
      nextOffset: hasMoreJobs ? offset + limit : null,
    });
  } catch (error) {
    return handleClientApiError(error);
  }
}
