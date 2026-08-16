import Link from "next/link";

import { AdminMetric, AdminPageHeader, AdminPanel, AdminStatusPill, TableCell, TableHead } from "@/components/admin/AdminUi";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";
import { getAdminPlatformReportData } from "@/modules/admin/core/getAdminControlTowerData";

type PageProps = { searchParams?: { days?: string } };

export default async function AdminReportsPage({ searchParams }: PageProps) {
  await requirePlatformAdmin();
  const requestedDays = Number(searchParams?.days ?? 30);
  const data = await getAdminPlatformReportData(requestedDays);

  return (
    <div className="space-y-7">
      <AdminPageHeader
        eyebrow="Governance"
        title="Platform Reports"
        description="Waste X platform performance and adoption. Customer operational reports stay under /home/reports; this screen tells us whether the platform itself is being used and whether DWT is healthy."
        actions={<Link href="/admin/audit" className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700">Activity & Audit</Link>}
      />

      <div className="flex flex-wrap gap-2">
        {[7, 30, 90].map((days) => (
          <Link key={days} href={`/admin/reports?days=${days}`} className={`rounded-full px-4 py-2 text-xs font-black transition ${data.days === days ? "bg-red-600 text-white" : "border border-white/15 bg-white/5 text-white/60 hover:text-white"}`}>{days} days</Link>
        ))}
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminMetric label="Organisations booking" value={data.organisationsBooking} helper={`Customer organisations creating jobs in ${data.days} days`} />
        <AdminMetric label="Jobs booked" value={data.jobs} helper={`Jobs created in ${data.days} days`} />
        <AdminMetric label="Completed loads" value={data.completedLoads} helper={`${data.tonnes.toFixed(3)} tonnes recorded`} />
        <AdminMetric label="DWT acceptance" value={`${data.dwtAcceptanceRate}%`} helper={`${data.dwtAccepted}/${data.dwtAttempts} attempts accepted`} danger={data.dwtAttempts > 0 && data.dwtAcceptanceRate < 95} />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <AdminPanel eyebrow="Usage" title="Operational adoption" description="High-level customer usage without exposing a platform-admin job editor.">
          <div className="space-y-3">
            <Row label="Jobs booked" value={data.jobs} />
            <Row label="Completed loads" value={data.completedLoads} />
            <Row label="Tonnes recorded" value={data.tonnes.toFixed(3)} />
            <Row label="Organisations booking work" value={data.organisationsBooking} />
          </div>
        </AdminPanel>

        <AdminPanel eyebrow="Digital Waste Tracking" title="DWT performance" description="The protected DWT Control page remains the investigation tool. These are platform-level reporting metrics only." action={<Link href="/admin/digital-waste-tracking" className="text-xs font-black text-red-600">Open DWT Control →</Link>}>
          <div className="space-y-3">
            <Row label="API attempts" value={data.dwtAttempts} />
            <Row label="Accepted / warnings" value={data.dwtAccepted} />
            <Row label="Rejected / failed" value={data.dwtFailed} danger={data.dwtFailed > 0} />
            <Row label="Acceptance rate" value={`${data.dwtAcceptanceRate}%`} danger={data.dwtAttempts > 0 && data.dwtAcceptanceRate < 95} />
          </div>
        </AdminPanel>
      </section>

      <AdminPanel eyebrow="Export Audit" title="Recent generated reports" description="The existing report export audit history is retained for governance. Customer report generation remains inside each customer workspace.">
        {data.exports.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-black/15 p-6 text-sm font-semibold text-black/40">No report exports recorded.</div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-black/10">
            <div className="overflow-x-auto">
              <table className="min-w-[1050px] w-full divide-y divide-black/10 text-sm">
                <thead><tr><TableHead>Report</TableHead><TableHead>Organisation</TableHead><TableHead>Requested by</TableHead><TableHead>Type</TableHead><TableHead>Format</TableHead><TableHead>Status</TableHead><TableHead>Rows</TableHead><TableHead>Created</TableHead></tr></thead>
                <tbody className="divide-y divide-black/10">
                  {data.exports.map((report) => (
                    <tr key={report.id} className="hover:bg-red-50/30">
                      <TableCell><span className="font-black text-black">{report.title}</span></TableCell>
                      <TableCell>{report.organisation?.teamName ?? "Unknown"}</TableCell>
                      <TableCell>{report.requestedBy?.name ?? report.requestedBy?.email ?? "Unknown"}</TableCell>
                      <TableCell>{formatLabel(report.reportType)}</TableCell>
                      <TableCell>{report.format.toUpperCase()}</TableCell>
                      <TableCell><AdminStatusPill label={formatLabel(report.status)} tone={report.status === "failed" ? "danger" : report.status === "completed" ? "dark" : "neutral"} /></TableCell>
                      <TableCell>{report.rowCount ?? 0}</TableCell>
                      <TableCell>{formatDate(report.createdAt)}</TableCell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </AdminPanel>
    </div>
  );
}

function Row({ label, value, danger = false }: { label: string; value: string | number; danger?: boolean }) { return <div className="flex items-center justify-between rounded-2xl border border-black/10 px-4 py-3"><span className="text-sm font-semibold text-black/50">{label}</span><span className={`text-sm font-black ${danger ? "text-red-600" : "text-black"}`}>{value}</span></div>; }
function formatLabel(value: string) { return value.replaceAll("_", " ").replaceAll("-", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function formatDate(value: Date | string | null | undefined) { if (!value) return "—"; return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
