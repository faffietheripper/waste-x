import Link from "next/link";

import {
  AdminMetric,
  AdminPageHeader,
  AdminPanel,
  AdminStatusPill,
  TableCell,
  TableHead,
} from "@/components/admin/AdminUi";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";
import { getAdminJobs } from "@/modules/admin/core/getAdminOperationsData";

type PageProps = {
  searchParams?: {
    search?: string;
  };
};

export default async function AdminJobsPage({ searchParams }: PageProps) {
  await requirePlatformAdmin();

  const search = searchParams?.search?.trim() ?? "";
  const jobs = await getAdminJobs(search);

  const loadCount = jobs.reduce((sum, job) => sum + job.loads.total, 0);
  const completed = jobs.reduce((sum, job) => sum + job.loads.completed, 0);
  const wasteItems = jobs.reduce((sum, job) => sum + job.loads.wasteItems, 0);

  return (
    <div className="space-y-7">
      <AdminPageHeader
        eyebrow="Read-only Operations"
        title="Jobs"
        description="Platform support inspector for canonical customer Jobs and their physical Loads. This area is read-only: customer operational edits remain inside the customer workspace."
        actions={
          <>
            <Link
              href="/admin/loads"
              className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-bold text-white hover:border-red-500"
            >
              Loads
            </Link>
            <Link
              href="/admin/diagnostics"
              className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700"
            >
              Diagnostics
            </Link>
          </>
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminMetric label="Jobs" value={jobs.length} helper="Current filtered view" />
        <AdminMetric label="Loads" value={loadCount} helper="Physical movements under these Jobs" />
        <AdminMetric label="Completed" value={completed} helper="Completed Load movements" />
        <AdminMetric label="Waste items" value={wasteItems} helper="Canonical multi-waste item rows" />
      </section>

      <AdminPanel eyebrow="Find" title="Search Jobs">
        <form className="flex flex-col gap-3 md:flex-row">
          <input
            name="search"
            defaultValue={search}
            placeholder="Job number, organisation, site, Driver, vehicle..."
            className="min-h-[3rem] flex-1 rounded-2xl border border-black/15 px-4 text-sm font-semibold outline-none focus:border-red-500"
          />
          <button className="rounded-2xl bg-black px-5 py-3 text-sm font-black text-white hover:bg-red-600">
            Search
          </button>
          <Link
            href="/admin/jobs"
            className="rounded-2xl border border-black/10 px-5 py-3 text-center text-sm font-black text-black"
          >
            Clear
          </Link>
        </form>
      </AdminPanel>

      <AdminPanel
        eyebrow="Canonical Jobs"
        title="Operational register"
        description="Load and waste-stream counts come from bb_job_load and bb_job_load_waste_item."
      >
        {jobs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-black/15 p-7 text-sm font-semibold text-black/40">
            No Jobs match this view.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-black/10">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1250px] divide-y divide-black/10 text-sm">
                <thead>
                  <tr>
                    <TableHead>Job</TableHead>
                    <TableHead>Organisation</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Direction</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Site</TableHead>
                    <TableHead>Driver / vehicle</TableHead>
                    <TableHead>Loads</TableHead>
                    <TableHead>Waste items</TableHead>
                    <TableHead>Inspect</TableHead>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/10">
                  {jobs.map((job) => (
                    <tr key={job.id}>
                      <TableCell>
                        <Link
                          href={`/admin/jobs/${job.id}`}
                          className="font-black text-black hover:text-red-600"
                        >
                          {job.jobNumber}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/admin/organisations/${job.organisationId}`}
                          className="font-black text-black hover:text-red-600"
                        >
                          {job.organisationName}
                        </Link>
                      </TableCell>
                      <TableCell>{formatDate(job.jobDate)}</TableCell>
                      <TableCell>{formatLabel(job.direction)}</TableCell>
                      <TableCell>
                        <AdminStatusPill
                          label={formatLabel(job.status)}
                          tone={job.status === "completed" ? "success" : "neutral"}
                        />
                      </TableCell>
                      <TableCell>{job.ownSiteName ?? "—"}</TableCell>
                      <TableCell>
                        <div>
                          <p>{job.driverName ?? "—"}</p>
                          <p className="mt-1 text-xs text-black/35">
                            {job.vehicleRegistration ?? "No vehicle"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-black text-black">
                          {job.loads.completed}/{job.loads.total}
                        </span>
                        <span className="ml-1 text-xs text-black/35">completed</span>
                      </TableCell>
                      <TableCell>{job.loads.wasteItems}</TableCell>
                      <TableCell>
                        <Link
                          href={`/admin/jobs/${job.id}`}
                          className="rounded-full bg-black px-3 py-1.5 text-xs font-black text-white hover:bg-red-600"
                        >
                          Open
                        </Link>
                      </TableCell>
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

function formatLabel(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(value));
}
