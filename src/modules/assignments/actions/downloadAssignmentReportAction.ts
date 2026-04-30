"use server";

import { generateAssignmentReport } from "../core/generateAssignmentReport";

export async function downloadAssignmentReportAction(assignmentId: string) {
  return generateAssignmentReport(assignmentId);
}
