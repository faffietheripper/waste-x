"use server";

import { database } from "@/db/database";
import { errorLogs } from "@/db/schema";
import { and, eq, desc, sql } from "drizzle-orm";

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
  const conditions = [];

  // ✅ STATUS (controls resolved state)
  if (status === "active") {
    conditions.push(eq(errorLogs.resolved, false));
  }

  if (status === "resolved") {
    conditions.push(eq(errorLogs.resolved, true));
  }

  // ✅ SEVERITY
  if (severity) {
    conditions.push(eq(errorLogs.severity, severity));
  }

  // ✅ CODE (simple exact match for now)
  if (code) {
    conditions.push(eq(errorLogs.code, code));
  }

  return await database
    .select()
    .from(errorLogs)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(errorLogs.createdAt))
    .limit(100);
}

// resolve action (unchanged)
export async function resolveErrorAction(id: string) {
  await database
    .update(errorLogs)
    .set({ resolved: true })
    .where(eq(errorLogs.id, id));
}

export async function getGroupedErrorsAction({
  severity,
  code,
  status = "active",
}: GetErrorsParams) {
  const conditions = [];

  if (status === "active") {
    conditions.push(eq(errorLogs.resolved, false));
  }

  if (status === "resolved") {
    conditions.push(eq(errorLogs.resolved, true));
  }

  if (severity) {
    conditions.push(eq(errorLogs.severity, severity));
  }

  if (code) {
    conditions.push(eq(errorLogs.code, code));
  }

  return await database
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
