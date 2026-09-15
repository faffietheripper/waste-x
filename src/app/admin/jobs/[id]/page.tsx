import Link from "next/link";
import { notFound } from "next/navigation";

import {
  AdminMetric,
  AdminPageHeader,
  AdminPanel,
  AdminStatusPill,
  TableCell,
  TableHead,
} from "@/components/admin/AdminUi";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";
import { getAdminJob } from "@/modules/admin/core/getAdminOperationsData";

type PageProps = {
  params: {
    id: string;
  };
};

export default async function AdminJobDetailPage({ params }: PageProps) {
  await requirePlatformAdmin();

  const job = await getAdminJob(params.id);
  if (!job) notFound();

  const completedLoads = job.loads.filter((load) => load.status === "completed").length;
  const wasteItems = job.loads.reduce((sum, load) => sum + load.wasteItemCount, 0);

  return (
    <div className="space-y-7">
      <AdminPageHeader
        eyebrow="Read-only Job"
        title={job.jobNumber}
        description="Canonical Job plan with its physical Load movements. Platform Admin is an inspector only; customer workflow edits remain inside the customer workspace."
        actions={
          <>
            <Link
              href="/admin/jobs"
              className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-bold text-white hover:border-red-500"
            >
              ← Jobs
            </Link>
            <Link
              href={`/admin/organisations/${job.organisationId}`}
              className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700"
            >
              Organisation
            </Link>
          </>
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <AdminMetric label="Status" value={formatLabel(job.status)} helper={formatLabel(job.direction)} />
        <AdminMetric label="Job date" value={formatDate(job.jobDate)} helper={job.organisationName} />
        <AdminMetric label="Loads" value={job.loads.length} helper={`${completedLoads} completed`} />
        <AdminMetric label="Planned loads" value={job.plannedLoads} helper="Customer Job plan" />
        <AdminMetric label="Waste items" value={wasteItems} helper="Canonical item rows across Loads" />
      </section>

      <AdminPanel eyebrow="Job Context" title="Plan metadata">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Info label="Organisation" value={job.organisationName} />
          <Info label="Own site" value={job.ownSiteName ?? "Not set"} />
          <Info label="Driver default" value={job.driverName ?? "Not set"} />
          <Info label="Vehicle default" value={job.vehicleRegistration ?? "Not set"} />
          <Info label="Purchase order" value={job.purchaseOrder ?? "—"} />
          <Info label="Customer reference" value={job.customerReference ?? "—"} />
          <Info label="Direction" value={formatLabel(job.direction)} />
          <Info label="Status" value={formatLabel(job.status)} />
        </div>
      </AdminPanel>

      <AdminPanel
        eyebrow="Physical Movements"
        title="Loads"
        description="Each row is one vehicle movement. Waste-item counts use bb_job_load_waste_item only."
      >
        {job.loads.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-black/15 p-7 text-sm font-semibold text-black/40">
            This Job has no Load rows yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-black/10">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1200px] divide-y divide-black/10 text-sm">
                <thead>
                  <tr>
                    <TableHead>Load</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Movement</TableHead>
                    <TableHead>Driver / vehicle</TableHead>
                    <TableHead>Net weight</TableHead>
                    <TableHead>Waste items</TableHead>
                    <TableHead>Ticket</TableHead>
                    <TableHead>Inspect</TableHead>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/10">
                  {job.loads.map((load) => (
                    <tr key={load.id}>
                      <TableCell>
                        <span className="font-black text-black">Load {load.loadNumber}</span>
                      </TableCell>
                      <TableCell>
                        <AdminStatusPill
                          label={formatLabel(load.status)}
                          tone={load.status === "completed" ? "success" : "neutral"}
                        />
                      </TableCell>
                      <TableCell>{formatDateTime(load.movementAt)}</TableCell>
                      <TableCell>
                        <div>
                          <p>{load.driverName ?? job.driverName ?? "—"}</p>
                          <p className="mt-1 text-xs text-black/35">
                            {load.vehicleRegistration ?? job.vehicleRegistration ?? "No vehicle"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {load.netWeight ?? "—"} {load.netWeight ? load.weightMetric : ""}
                      </TableCell>
                      <TableCell>
                        {load.wasteItemCount === 0 ? (
                          <span className="font-bold text-amber-700">0 canonical rows</span>
                        ) : (
                          load.wasteItemCount
                        )}
                      </TableCell>
                      <TableCell>{load.ticketNumber ?? "—"}</TableCell>
                      <TableCell>
                        <Link
                          href={`/admin/loads/${load.id}`}
                          className="rounded-full bg-black px-3 py-1.5 text-xs font-black text-white hover:bg-red-600"
                        >
                          Inspect Load
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/10 p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.15em] text-black/30">{label}</p>
      <p className="mt-2 break-all text-sm font-black text-black">{value}</p>
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

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
