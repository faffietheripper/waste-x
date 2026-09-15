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
import { getAdminDevice } from "@/modules/admin/core/getAdminDeviceData";

import {
  reactivateDeviceAction,
  revokeDeviceAction,
  suspendDeviceAction,
} from "../actions";

type PageProps = {
  params: {
    id: string;
  };
};

export default async function AdminDeviceDetailPage({ params }: PageProps) {
  await requirePlatformAdmin();

  const device = await getAdminDevice(params.id);
  if (!device) notFound();

  const activeUser =
    device.registeredByIsActive &&
    !device.registeredByIsSuspended &&
    device.registeredByStatus !== "SUSPENDED";

  return (
    <div className="space-y-7">
      <AdminPageHeader
        eyebrow="Platform Security"
        title={device.displayName}
        description="Cloud-side registration and session evidence for this Waste X client. This view never opens or reads the customer's Desktop SQLCipher database or Mobile local storage."
        actions={
          <>
            <Link
              href="/admin/devices"
              className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-bold text-white hover:border-red-500"
            >
              ← Devices
            </Link>

            <Link
              href={`/admin/organisations/${device.organisationId}`}
              className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700"
            >
              Organisation
            </Link>

            <Link
              href={`/admin/diagnostics?deviceId=${encodeURIComponent(device.id)}`}
              className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-bold text-white hover:border-red-500"
            >
              Diagnostics
            </Link>
          </>
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <AdminMetric
          label="Status"
          value={formatLabel(device.status)}
          helper={`${formatLabel(device.deviceType)} · ${formatLabel(device.platform)}`}
          danger={device.status === "REVOKED"}
          tone={device.status === "SUSPENDED" ? "warning" : undefined}
        />
        <AdminMetric
          label="Active sessions"
          value={device.activeSessionCount}
          helper={`${device.sessions.length} session records`}
        />
        <AdminMetric
          label="Last device seen"
          value={formatCompact(device.lastSeenAt)}
          helper="Cloud-side device heartbeat"
        />
        <AdminMetric
          label="Last session seen"
          value={formatCompact(device.latestSessionSeenAt)}
          helper="Latest Cloud session activity"
        />
        <AdminMetric
          label="Registered"
          value={formatCompact(device.createdAt)}
          helper="Device registration date"
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <AdminPanel
          eyebrow="Registration"
          title="Device context"
          description="Minimum platform metadata needed to support and secure this client."
        >
          <div className="space-y-3">
            <Info label="Device ID" value={device.id} mono />
            <Info label="Client" value={formatLabel(device.deviceType)} />
            <Info label="Platform" value={formatLabel(device.platform)} />
            <Info
              label="Organisation"
              value={device.organisationName}
              href={`/admin/organisations/${device.organisationId}`}
            />
            <Info
              label="Default site"
              value={
                device.siteName
                  ? `${device.siteName}${device.sitePostcode ? ` · ${device.sitePostcode}` : ""}`
                  : "Not assigned"
              }
            />
            <Info label="Last seen" value={formatDateTime(device.lastSeenAt)} />
            <Info label="Revoked at" value={formatDateTime(device.revokedAt)} />
          </div>
        </AdminPanel>

        <AdminPanel
          eyebrow="Identity"
          title="User & Driver relationship"
          description="The registering user is the Cloud account associated with this device. Driver linkage is shown only when that user is explicitly linked to a Driver."
        >
          <div className="space-y-3">
            <Info
              label="Registered user"
              value={
                device.registeredByName ??
                device.registeredByEmail ??
                "Not recorded"
              }
              href={
                device.registeredByUserId
                  ? `/admin/users/${device.registeredByUserId}`
                  : undefined
              }
            />
            <Info
              label="User account"
              value={
                device.registeredByUserId
                  ? activeUser
                    ? "Active"
                    : "Restricted / inactive"
                  : "Not recorded"
              }
            />
            <Info
              label="Driver"
              value={device.linkedDriver?.name ?? "Not linked"}
            />
            <Info
              label="Driver operational"
              value={
                device.linkedDriver
                  ? device.linkedDriver.isActive
                    ? "Active"
                    : "Archived"
                  : "—"
              }
            />
            <Info
              label="Driver Mobile access"
              value={
                device.linkedDriver
                  ? formatLabel(device.linkedDriver.mobileAccessStatus)
                  : "—"
              }
            />
            <Info
              label="Default vehicle"
              value={
                device.linkedDriver?.defaultVehicleRegistration ?? "Not set"
              }
            />
          </div>
        </AdminPanel>
      </section>

      <AdminPanel
        eyebrow="Security Control"
        title="Device access"
        description="Suspend is reversible but terminates existing sessions. Reactivation requires a fresh login. Revoke permanently blocks this registration and terminates every remaining Cloud session."
      >
        <div className="flex flex-wrap items-center gap-3">
          <AdminStatusPill
            label={formatLabel(device.status)}
            tone={
              device.status === "ACTIVE"
                ? "success"
                : device.status === "SUSPENDED"
                  ? "warning"
                  : "danger"
            }
          />

          {device.status === "ACTIVE" ? (
            <form action={suspendDeviceAction.bind(null, device.id)}>
              <button
                type="submit"
                className="rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-black text-amber-800"
              >
                Suspend device
              </button>
            </form>
          ) : null}

          {device.status === "SUSPENDED" ? (
            <form action={reactivateDeviceAction.bind(null, device.id)}>
              <button
                type="submit"
                className="rounded-full bg-black px-4 py-2 text-sm font-black text-white hover:bg-red-600"
              >
                Reactivate device
              </button>
            </form>
          ) : null}

          {device.status !== "REVOKED" ? (
            <form action={revokeDeviceAction.bind(null, device.id)}>
              <button
                type="submit"
                className="rounded-full bg-red-600 px-4 py-2 text-sm font-black text-white hover:bg-red-700"
              >
                Revoke permanently
              </button>
            </form>
          ) : null}
        </div>
      </AdminPanel>

      <AdminPanel
        eyebrow="Cloud Sessions"
        title="Session history"
        description="Session metadata only. Authentication token hashes and refresh-token hashes are deliberately excluded from Admin data access."
      >
        {device.sessions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-black/15 p-7 text-sm font-semibold text-black/40">
            No Cloud sessions are recorded for this device.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-black/10">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] divide-y divide-black/10 text-sm">
                <thead>
                  <tr>
                    <TableHead>Session</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Last seen</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Revoked</TableHead>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/10">
                  {device.sessions.map((session) => {
                    const isActive =
                      !session.revokedAt && session.expiresAt > new Date();
                    const status = session.revokedAt
                      ? "Revoked"
                      : isActive
                        ? "Active"
                        : "Expired";

                    return (
                      <tr key={session.id}>
                        <TableCell>
                          <span className="font-mono text-xs">{session.id}</span>
                        </TableCell>
                        <TableCell>
                          {session.userId === device.registeredByUserId &&
                          device.registeredByUserId ? (
                            <Link
                              href={`/admin/users/${device.registeredByUserId}`}
                              className="font-black text-black hover:text-red-600"
                            >
                              {device.registeredByName ??
                                device.registeredByEmail ??
                                session.userId}
                            </Link>
                          ) : (
                            <span className="font-mono text-xs">
                              {session.userId}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <AdminStatusPill
                            label={status}
                            tone={
                              status === "Active"
                                ? "success"
                                : status === "Revoked"
                                  ? "danger"
                                  : "neutral"
                            }
                          />
                        </TableCell>
                        <TableCell>{formatDateTime(session.createdAt)}</TableCell>
                        <TableCell>{formatDateTime(session.lastSeenAt)}</TableCell>
                        <TableCell>{formatDateTime(session.expiresAt)}</TableCell>
                        <TableCell>{formatDateTime(session.revokedAt)}</TableCell>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </AdminPanel>
    </div>
  );
}

function Info({
  label,
  value,
  href,
  mono = false,
}: {
  label: string;
  value: string;
  href?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-black/10 px-4 py-3">
      <span className="text-xs font-black uppercase tracking-[0.14em] text-black/35">
        {label}
      </span>
      {href ? (
        <Link
          href={href}
          className={`text-right text-sm font-black text-black hover:text-red-600 ${mono ? "font-mono" : ""}`}
        >
          {value}
        </Link>
      ) : (
        <span
          className={`max-w-[65%] break-all text-right text-sm font-black text-black ${mono ? "font-mono text-xs" : ""}`}
        >
          {value}
        </span>
      )}
    </div>
  );
}

function formatLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatCompact(value: Date | string | null | undefined) {
  if (!value) return "Never";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
  }).format(new Date(value));
}
