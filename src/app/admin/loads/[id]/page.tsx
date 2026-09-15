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
import { getAdminLoad } from "@/modules/admin/core/getAdminOperationsData";

type PageProps = {
  params: {
    id: string;
  };
};

export default async function AdminLoadDetailPage({ params }: PageProps) {
  await requirePlatformAdmin();

  const load = await getAdminLoad(params.id);
  if (!load) notFound();

  const syncAttention = load.syncEvents.filter((event) =>
    ["CONFLICT", "RETRYABLE_ERROR", "REJECTED"].includes(event.resultStatus),
  ).length;

  return (
    <div className="space-y-7">
      <AdminPageHeader
        eyebrow="Read-only Load"
        title={`${load.jobNumber} · Load ${load.loadNumber}`}
        description="One physical vehicle movement. Gross/tare/net stay at Load level; each canonical waste stream is shown separately from bb_job_load_waste_item."
        actions={
          <>
            <Link
              href={`/admin/jobs/${load.jobId}`}
              className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-bold text-white hover:border-red-500"
            >
              ← Job
            </Link>
            <Link
              href={`/admin/diagnostics?organisationId=${encodeURIComponent(load.organisationId)}&search=${encodeURIComponent(load.id)}`}
              className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700"
            >
              Correlated diagnostics
            </Link>
          </>
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <AdminMetric label="Status" value={formatLabel(load.status)} helper={formatLabel(load.direction)} />
        <AdminMetric
          label="Net weight"
          value={load.netWeight ?? "—"}
          helper={load.netWeight ? `${load.weightMetric} · ${formatLabel(load.weightSource)}` : "Not captured"}
        />
        <AdminMetric label="Waste items" value={load.wasteItems.length} helper="Canonical waste streams" />
        <AdminMetric label="Ticket" value={load.ticketNumber ?? "None"} helper="Receiving-site ticket number" />
        <AdminMetric
          label="Sync attention"
          value={syncAttention}
          helper={`${load.syncEvents.length} sync events`}
          danger={syncAttention > 0}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <AdminPanel eyebrow="Movement" title="Operational context">
          <div className="grid gap-3 sm:grid-cols-2">
            <Info label="Organisation" value={load.organisationName} />
            <Info label="Site" value={load.ownSiteName ?? "Not set"} />
            <Info label="Driver" value={load.driverName ?? "Not set"} />
            <Info label="Vehicle" value={load.vehicleRegistration ?? "Not set"} />
            <Info label="Movement at" value={formatDateTime(load.movementAt)} />
            <Info label="Received at" value={formatDateTime(load.receivedAt)} />
            <Info label="Completed at" value={formatDateTime(load.completedAt)} />
            <Info label="Updated" value={formatDateTime(load.updatedAt)} />
            <Info label="Purchase order" value={load.purchaseOrder ?? "—"} />
            <Info label="Customer reference" value={load.customerReference ?? "—"} />
          </div>
        </AdminPanel>

        <AdminPanel
          eyebrow="Weights"
          title="Physical Load weight"
          description="Gross, tare and net belong to the vehicle movement. Individual waste-item weights below are allocations of final net."
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Weight label="Gross" value={load.grossWeight} metric={load.weightMetric} />
            <Weight label="Tare" value={load.tareWeight} metric={load.weightMetric} />
            <Weight label="Net" value={load.netWeight} metric={load.weightMetric} />
          </div>
          <p className="mt-4 text-xs font-semibold text-black/40">
            Source: {formatLabel(load.weightSource)}
            {load.weightIsEstimate ? " · Estimate" : " · Factual"}
          </p>
        </AdminPanel>
      </section>

      <AdminPanel
        eyebrow="Canonical Multi-waste"
        title="Waste on this Load"
        description="Factual EWC classification is displayed separately from the permit/regulatory acceptance basis. Legacy Load-level item-1 mirrors are not rendered."
      >
        {load.wasteItems.length === 0 ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-semibold leading-6 text-amber-900">
            No canonical bb_job_load_waste_item rows exist for this Load. The
            legacy Load-level material/EWC compatibility mirror is intentionally
            not shown as a substitute, because doing so could misrepresent a
            multi-waste movement.
          </div>
        ) : (
          <div className="space-y-4">
            {load.wasteItems.map((item) => (
              <article key={item.id} className="rounded-2xl border border-black/10 p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-red-600">
                      Waste item {item.itemNumber}
                    </p>
                    <h3 className="mt-2 text-lg font-black text-black">
                      {item.ewcCodeSnapshot} · {item.wasteDescriptionSnapshot}
                    </h3>
                    <p className="mt-2 text-xs font-semibold text-black/40">
                      {item.physicalFormSnapshot ?? "Physical form not recorded"}
                      {item.disposalRecoveryCodeSnapshot
                        ? ` · ${item.disposalRecoveryCodeSnapshot}`
                        : ""}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-xl font-black text-black">
                      {item.weightAmount ?? "—"}{" "}
                      {item.weightAmount ? item.weightMetric : ""}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-black/35">
                      {formatLabel(item.weightSource)}
                      {item.weightIsEstimate ? " · estimate" : ""}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <Info
                    label="Containers"
                    value={
                      item.numberOfContainers
                        ? `${item.numberOfContainers} · ${item.containerTypeSnapshot ?? "type not recorded"}`
                        : "Not recorded"
                    }
                  />
                  <Info label="Hazardous" value={item.containsHazardous ? "Yes" : "No"} />
                  <Info label="POPs" value={item.containsPops ? "Yes" : "No"} />
                  <Info
                    label="Acceptance"
                    value={
                      item.permitEwcMatchType
                        ? formatLabel(item.permitEwcMatchType)
                        : "Not recorded"
                    }
                  />
                  <Info
                    label="Acceptance basis"
                    value={
                      item.permitEwcBasis ??
                      item.regulatoryRuleKeySnapshot ??
                      "Not recorded"
                    }
                  />
                  <Info
                    label="Authority reference"
                    value={
                      item.qualifyingAuthorisationRefSnapshot ??
                      item.permitEwcReference ??
                      "—"
                    }
                  />
                  <Info
                    label="Authorisation EWC"
                    value={item.permitEwcCodeSnapshot ?? "—"}
                  />
                  <Info
                    label="Checked"
                    value={formatDateTime(item.permitEwcCheckedAt)}
                  />
                </div>
              </article>
            ))}
          </div>
        )}
      </AdminPanel>

      <section className="grid gap-6 xl:grid-cols-2">
        <AdminPanel
          eyebrow="Evidence"
          title="Client evidence metadata"
          description="File contents, storage keys and hashes are not exposed in normal Platform Admin."
        >
          {load.evidence.length === 0 ? (
            <Empty>No client evidence records are attached to this Load.</Empty>
          ) : (
            <div className="space-y-3">
              {load.evidence.map((evidence) => (
                <div key={evidence.evidenceId} className="rounded-2xl border border-black/10 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-black text-black">{evidence.fileName}</p>
                      <p className="mt-1 text-xs text-black/35">
                        {evidence.contentType} · {formatBytes(evidence.byteSize)}
                      </p>
                    </div>
                    <AdminStatusPill
                      label={formatLabel(evidence.status)}
                      tone={evidence.status === "UPLOADED" ? "success" : evidence.status === "FAILED" ? "danger" : "warning"}
                    />
                  </div>
                  <p className="mt-3 text-xs text-black/35">
                    Device{" "}
                    <Link href={`/admin/devices/${evidence.deviceId}`} className="font-black text-black hover:text-red-600">
                      {evidence.deviceId}
                    </Link>
                    {" · "}
                    {formatDateTime(evidence.uploadedAt ?? evidence.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </AdminPanel>

        <AdminPanel
          eyebrow="Sync"
          title="Canonical sync outcomes"
          description="Result metadata only. Raw sync payload and payload hash are deliberately excluded."
        >
          {load.syncEvents.length === 0 ? (
            <Empty>No sync inbox events are recorded for this Load.</Empty>
          ) : (
            <div className="space-y-3">
              {load.syncEvents.map((event) => (
                <div key={event.eventId} className="rounded-2xl border border-black/10 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-black text-black">{event.eventType}</p>
                      <p className="mt-1 text-xs text-black/35">
                        seq {event.deviceSequence}
                        {event.reasonCode ? ` · ${event.reasonCode}` : ""}
                      </p>
                    </div>
                    <AdminStatusPill
                      label={formatLabel(event.resultStatus)}
                      tone={syncTone(event.resultStatus)}
                    />
                  </div>
                  <p className="mt-3 text-xs text-black/35">
                    <Link href={`/admin/devices/${event.deviceId}`} className="font-black text-black hover:text-red-600">
                      Device
                    </Link>
                    {" · "}
                    {formatDateTime(event.receivedAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </AdminPanel>
      </section>

      <AdminPanel
        eyebrow="Diagnostics"
        title="Correlated safe events"
        description="Only sanitised Patch C diagnostic envelopes tied directly to this Job Load are shown."
      >
        {!load.diagnosticsStorageReady ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-semibold text-amber-900">
            Diagnostics storage has not been applied in this environment yet.
            Load, waste, evidence and sync inspection remain available.
          </div>
        ) : load.diagnostics.length === 0 ? (
          <Empty>No sanitised diagnostic events are correlated to this Load.</Empty>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-black/10">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] divide-y divide-black/10 text-sm">
                <thead>
                  <tr>
                    <TableHead>When</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead>Safe message</TableHead>
                    <TableHead>Correlation</TableHead>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/10">
                  {load.diagnostics.map((event) => (
                    <tr key={event.id}>
                      <TableCell>{formatDateTime(event.occurredAt)}</TableCell>
                      <TableCell>
                        <AdminStatusPill
                          label={formatLabel(event.severity)}
                          tone={event.severity === "critical" || event.severity === "high" ? "danger" : event.severity === "medium" ? "warning" : "neutral"}
                        />
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs font-black">{event.code}</span>
                      </TableCell>
                      <TableCell>{formatLabel(event.outcome)}</TableCell>
                      <TableCell>{event.safeMessage}</TableCell>
                      <TableCell>
                        <span className="font-mono text-[10px]">{event.correlationId}</span>
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
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-black/30">{label}</p>
      <p className="mt-2 break-all text-sm font-black text-black">{value}</p>
    </div>
  );
}

function Weight({
  label,
  value,
  metric,
}: {
  label: string;
  value: string | null;
  metric: string;
}) {
  return (
    <div className="rounded-2xl bg-black p-5 text-white">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40">{label}</p>
      <p className="mt-2 text-2xl font-black">
        {value ?? "—"} {value ? metric : ""}
      </p>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-black/15 p-5 text-sm font-semibold text-black/40">
      {children}
    </div>
  );
}

function syncTone(value: string) {
  if (value === "APPLIED" || value === "DUPLICATE") return "success" as const;
  if (value === "CONFLICT" || value === "RETRYABLE_ERROR") return "warning" as const;
  return "danger" as const;
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

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
