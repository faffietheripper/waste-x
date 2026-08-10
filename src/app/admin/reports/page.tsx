import { sql } from "drizzle-orm";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { database } from "@/db/database";
import ReportHistoryTable, {
  type ReportHistoryItem,
} from "@/modules/reports/components/ReportHistoryTable";
import {
  getReportUserContextFromSession,
  isPlatformAdmin,
} from "@/modules/reports/core/reportPermissions";

type RunRowsResult<Row> = {
  rows?: Row[];
};

export default async function AdminReportsPage() {
  const session = await auth();
  const context = getReportUserContextFromSession(session);

  if (!context.userId) {
    redirect("/login");
  }

  if (!isPlatformAdmin(context)) {
    redirect("/home");
  }

  const result = (await database.execute(sql`
    SELECT
      r.id,
      r."organisationId",
      org."teamName" AS "organisationName",
      r."requestedByUserId",
      u.name AS "requestedByName",
      u.email AS "requestedByEmail",
      r.title,
      r."reportType",
      r.format,
      r.status,
      r."rowCount",
      r."createdAt",
      r."generatedAt",
      r."downloadedAt",
      r."errorMessage"
    FROM bb_report_export r
    LEFT JOIN bb_organisation org
      ON org.id = r."organisationId"
    LEFT JOIN bb_user u
      ON u.id = r."requestedByUserId"
    ORDER BY r."createdAt" DESC
    LIMIT 150
  `)) as unknown as RunRowsResult<ReportHistoryItem>;

  const reports = result.rows ?? [];

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="rounded-[2rem] bg-black p-8 text-white shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-400">
            Platform Admin
          </p>

          <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
            Report Export Audit
          </h1>

          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
            Track which organisations are generating reports, who generated them,
            when they were created, whether they were downloaded, and whether any
            exports failed.
          </p>
        </section>

        <ReportHistoryTable
          reports={reports}
          showOrganisation
          showRequestedBy
        />
      </div>
    </main>
  );
}