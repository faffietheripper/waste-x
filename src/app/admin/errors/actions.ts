"use server";

import { database } from "@/db/database";
import { errorLogs } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";
import { revalidatePath } from "next/cache";

type Severity = "low" | "medium" | "high" | "critical";
type Status = "active" | "resolved" | "all";

type GetErrorsParams = {
  severity?: Severity;
  code?: string;
  status?: Status;
};

export async function getErrorsAction({
  severity,
  code,
  status = "active",
}: GetErrorsParams) {
  await requirePlatformAdmin();

  const conditions = [];

  if (status === "active") conditions.push(eq(errorLogs.resolved, false));
  if (status === "resolved") conditions.push(eq(errorLogs.resolved, true));
  if (severity) conditions.push(eq(errorLogs.severity, severity));
  if (code) conditions.push(eq(errorLogs.code, code));

  return database
    .select()
    .from(errorLogs)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(errorLogs.createdAt))
    .limit(100);
}

export async function resolveErrorAction(id: string) {
  await requirePlatformAdmin();

  await database
    .update(errorLogs)
    .set({ resolved: true })
    .where(eq(errorLogs.id, id));

  revalidatePath("/admin/errors");
}

export async function getGroupedErrorsAction({
  severity,
  code,
  status = "active",
}: GetErrorsParams) {
  await requirePlatformAdmin();

  const conditions = [];

  if (status === "active") conditions.push(eq(errorLogs.resolved, false));
  if (status === "resolved") conditions.push(eq(errorLogs.resolved, true));
  if (severity) conditions.push(eq(errorLogs.severity, severity));
  if (code) conditions.push(eq(errorLogs.code, code));

  return database
    .select({
      code: errorLogs.code,
      severity: errorLogs.severity,
      message: errorLogs.message,
      count: sql<number>`count(*)`,
      latest: sql<Date>`max(${errorLogs.createdAt})`,
    })
    .from(errorLogs)
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(errorLogs.code, errorLogs.severity, errorLogs.message)
    .orderBy(desc(sql`max(${errorLogs.createdAt})`));
}
