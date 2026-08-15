import { and, eq } from "drizzle-orm";

import { database } from "@/db/database";
import { jobs } from "@/db/schema";

/**
 * Recomputes the parent Job status from its load states.
 *
 * Rules:
 * - cancelled jobs are never reopened automatically
 * - all planned/cancelled -> booked
 * - any started load -> in_progress
 * - all non-cancelled loads terminal (completed/rejected) -> completed
 *
 * A rejected load is operationally terminal. It does not mean the waste was
 * accepted; it means the movement is finished and remains visible as rejected.
 */
export async function syncJobStatus(
  jobId: string,
  organisationId: string,
) {
  const job = await database.query.jobs.findFirst({
    where: and(
      eq(jobs.id, jobId),
      eq(jobs.organisationId, organisationId),
    ),
    columns: {
      id: true,
      status: true,
      completedAt: true,
    },
    with: {
      loads: {
        columns: {
          id: true,
          status: true,
        },
      },
    },
  });

  if (!job || job.status === "cancelled" || job.status === "draft") {
    return;
  }

  const nonCancelledLoads = job.loads.filter(
    (load) => load.status !== "cancelled",
  );

  const now = new Date();

  if (nonCancelledLoads.length === 0) {
    await database
      .update(jobs)
      .set({
        status: "booked",
        completedAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(jobs.id, jobId),
          eq(jobs.organisationId, organisationId),
        ),
      );

    return;
  }

  const allTerminal = nonCancelledLoads.every(
    (load) =>
      load.status === "completed" || load.status === "rejected",
  );

  if (allTerminal) {
    await database
      .update(jobs)
      .set({
        status: "completed",
        completedAt: job.completedAt ?? now,
        updatedAt: now,
      })
      .where(
        and(
          eq(jobs.id, jobId),
          eq(jobs.organisationId, organisationId),
        ),
      );

    return;
  }

  const hasStarted = nonCancelledLoads.some(
    (load) => load.status !== "planned",
  );

  await database
    .update(jobs)
    .set({
      status: hasStarted ? "in_progress" : "booked",
      completedAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(jobs.id, jobId),
        eq(jobs.organisationId, organisationId),
      ),
    );
}
