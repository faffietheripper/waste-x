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
import { getAdminLoads } from "@/modules/admin/core/getAdminOperationsData";

type PageProps = {
  searchParams?: {
    search?: string;
  };
};

export default async function AdminLoadsPage({ searchParams }: PageProps) {
  await requirePlatformAdmin();

  const search = searchParams?.search?.trim() ?? "";
  const loads = await getAdminLoads(search);

  const completed = loads.filter((load) => load.status === "completed").length;
  const ticketed = loads.filter((load) => Boolean(load.ticketNumber)).length;
  const multiWaste = loads.filter((load) => load.wasteItemCount > 1).length;

  return (
    <div className="space-y-7">
      <AdminPageHeader
        eyebrow="Read-only Operations"
        title="Loads"
        description="One row per physical vehicle movement. Waste X Platform Admin can inspect status, weights, ticket metadata and canonical waste-item count without editing customer operations."
        actions={
          <>
            <Link
              href="/admin/jobs"
              className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-bold text-white hover:border-red-500"
            >
              Jobs
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
        <AdminMetric label="Loads" value={loads.length} helper="Current filtered view" />
        <AdminMetric label="Completed" value={completed} helper="Completed movements" />
        <AdminMetric label="Ticketed" value={ticketed} helper="Receiving-site ticket recorded" />
        <AdminMetric label="Multi-waste" value={multiWaste} helper="More than one canonical waste item" />
      </section>

      <AdminPanel eyebrow="Find" title="Search Loads">
        <form className="flex flex-col gap-3 md:flex-row">
          <input
            name="search"
            defaultValue={search}
            placeholder="Job, load, organisation, Driver, vehicle, ticket..."
            className="min-h-[3rem] flex-1 rounded-2xl border border-black/15 px-4 text-sm font-semibold outline-none focus:border-red-500"
          />
          <button className="rounded-2xl bg-black px-5 py-3 text-sm font-black text-white hover:bg-red-600">
            Search
          </button>
          <Link
            href="/admin/loads"
            className="rounded-2xl border border-black/10 px-5 py-3 text-center text-sm font-black text-black"
          >
            Clear
          </Link>
        </form>
      </AdminPanel>

      <AdminPanel
        eyebrow="Physical Movements"
        title="Load register"
        description="Legacy load-level material/EWC compatibility mirrors are intentionally not rendered as waste streams."
      >
        {loads.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-black/15 p-7 text-sm font-semibold text-black/40">
            No Loads match this view.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-black/10">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1450px] divide-y divide-black/10 text-sm">
                <thead>
                  <tr>
                    <TableHead>Movement</TableHead>
                    <TableHead>Organisation</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Direction</TableHead>
                    <TableHead>Site</TableHead>
                    <TableHead>Driver / vehicle</TableHead>
                    <TableHead>Net weight</TableHead>
                    <TableHead>Waste items</TableHead>
                    <TableHead>Ticket</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead>Inspect</TableHead>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/10">
                  {loads.map((load) => (
                    <tr key={load.id}>
                      <TableCell>
                        <div>
                          <Link
                            href={`/admin/loads/${load.id}`}
                            className="font-black text-black hover:text-red-600"
                          >
                            {load.jobNumber} · Load {load.loadNumber}
                          </Link>
                          <p className="mt-1 text-xs text-black/35">
                            {formatDateTime(load.movementAt)}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/admin/organisations/${load.organisationId}`}
                          className="font-black text-black hover:text-red-600"
                        >
                          {load.organisationName}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <AdminStatusPill
                          label={formatLabel(load.status)}
                          tone={load.status === "completed" ? "success" : "neutral"}
                        />
                      </TableCell>
                      <TableCell>{formatLabel(load.direction)}</TableCell>
                      <TableCell>{load.ownSiteName ?? "—"}</TableCell>
                      <TableCell>
                        <div>
                          <p>{load.driverName ?? "—"}</p>
                          <p className="mt-1 text-xs text-black/35">
                            {load.vehicleRegistration ?? "No vehicle"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {load.netWeight ?? "—"} {load.netWeight ? load.weightMetric : ""}
                      </TableCell>
                      <TableCell>
                        <span className="font-black text-black">{load.wasteItemCount}</span>
                      </TableCell>
                      <TableCell>{load.ticketNumber ?? "—"}</TableCell>
                      <TableCell>{formatDateTime(load.updatedAt)}</TableCell>
                      <TableCell>
                        <Link
                          href={`/admin/loads/${load.id}`}
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

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
