"use server";

import { database } from "@/db/database";
import { errorLogs } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";

type Severity = "low" | "medium" | "high" | "critical";

type GetErrorsParams = {
  severity?: Severity;
  code?: string;
};

export async function getErrorsAction({ severity, code }: GetErrorsParams) {
  const conditions = [];

  // optional: only show unresolved
  conditions.push(eq(errorLogs.resolved, false));

  if (severity) {
    conditions.push(eq(errorLogs.severity, severity));
  }

  if (code) {
    conditions.push(eq(errorLogs.code, code));
  }

  return await database
    .select()
    .from(errorLogs)
    .where(and(...conditions))
    .orderBy(desc(errorLogs.createdAt))
    .limit(100);
}

export async function resolveErrorAction(id: string) {
  await database
    .update(errorLogs)
    .set({ resolved: true })
    .where(eq(errorLogs.id, id));
}
