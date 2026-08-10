"use server";

import { eq } from "drizzle-orm";

import { database } from "@/db/database";
import { reportExports } from "@/db/schema";

export async function markReportDownloadedAction(reportId: string) {
  return markReportDownloaded(reportId);
}

export async function markReportDownloaded(reportId: string) {
  await database
    .update(reportExports)
    .set({
      downloadedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(reportExports.id, reportId));
}