import Link from "next/link";

import {
  AdminMetric,
  AdminPageHeader,
  AdminPanel,
  AdminStatusPill,
  TableCell,
  TableHead,
} from "@/components/admin/AdminUi";
import {
  type ClientDeviceStatus,
  type ClientDeviceType,
} from "@/db/client-sync-schema";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";
import { getAdminDevices } from "@/modules/admin/core/getAdminDeviceData";

import {
  reactivateDeviceAction,
  revokeDeviceAction,
  suspendDeviceAction,
} from "./actions";

type PageProps = {
  searchParams?: {
    search?: string;
    status?: string;
    type?: string;
    organisationId?: string;
    userId?: string;
  };
};

function deviceStatus(value?: string): ClientDeviceStatus | undefined {
  return ["ACTIVE", "SUSPENDED", "REVOKED"].includes(value ?? "")
    ? (value as ClientDeviceStatus)
    : undefined;
}

function deviceType(value?: string): ClientDeviceType | undefined {
  return ["DESKTOP", "MOBILE"].includes(value ?? "")
    ? (value as ClientDeviceType)
    : undefined;
}

function statusTone(status: ClientDeviceStatus) {
  if (status === "ACTIVE") return "success" as const;
  if (status === "SUSPENDED") return "warning" as const;
  return "danger" as const;
}

function isStale(value: Date | null) {
  if (!value) return true;
  return Date.now() - value.getTime() > 7 * 24 * 60 * 60 * 1000;
}

export default async function AdminDevicesPage({ searchParams }: PageProps) {
  await requirePlatformAdmin();

  const filters = {
    search: searchParams?.search?.trim() || undefined,
    status: deviceStatus(searchParams?.status),
    deviceType: deviceType(searchParams?.type),
    organisationId: searchParams?.organisationId?.trim() || undefined,
    userId: searchParams?.userId?.trim() || undefined,
  };

  const rows = await getAdminDevices(filters);

  const active = rows.filter((row) => row.status === "ACTIVE").length;
  const suspended = rows.filter((row) => row.status === "SUSPENDED").length;
  const revoked = rows.filter((row) => row.status === "REVOKED").length;
  const stale = rows.filter(
    (row) => row.status === "ACTIVE" && isStale(row.lastSeenAt),
  ).length;

  return (
    <div className="space-y-7">
      <AdminPageHeader
        eyebrow="Platform Security"
        title="Devices"
        description="Canonical Waste X Desktop and Mobile device registry. Platform admins can inspect registration and session health without accessing customer local databases, encryption keys or authentication secrets."
        actions={
          <Link
            href="/admin/users"
            className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-bold text-white hover:border-red-500"
          >
            Users & Access
          </Link>
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <AdminMetric
          label="Devices"
          value={rows.length}
          helper="Current filtered result"
        />
        <AdminMetric
          label="Active"
          value={active}
          helper="Allowed to authenticate"
        />
        <AdminMetric
          label="Suspended"
          value={suspended}
          helper="Sessions terminated; may be restored"
          tone={suspended ? "warning" : "default"}
        />
        <AdminMetric
          label="Revoked"
          value={revoked}
          helper="Permanently blocked registrations"
          danger={revoked > 0}
        />
        <AdminMetric
          label="Stale active"
          value={stale}
          helper="No device heartbeat in 7+ days"
          tone={stale ? "warning" : "default"}
        />
      </section>

      <AdminPanel
        eyebrow="Filters"
        title="Find a registered client"
        description="Search by device, organisation, site, user, Driver, vehicle or platform."
      >
        <form className="grid gap-3 lg:grid-cols-[1fr_180px_180px_auto_auto]">
          <input
            name="search"
            defaultValue={filters.search ?? ""}
            placeholder="Device, organisation, user, Driver..."
            className="min-h-[3rem] rounded-2xl border border-black/15 px-4 text-sm font-semibold outline-none focus:border-red-500"
          />

          <select
            name="type"
            defaultValue={filters.deviceType ?? ""}
            className="min-h-[3rem] rounded-2xl border border-black/15 bg-white px-4 text-sm font-semibold"
          >
            <option value="">All clients</option>
            <option value="DESKTOP">Desktop</option>
            <option value="MOBILE">Mobile</option>
          </select>

          <select
            name="status"
            defaultValue={filters.status ?? ""}
            className="min-h-[3rem] rounded-2xl border border-black/15 bg-white px-4 text-sm font-semibold"
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="REVOKED">Revoked</option>
          </select>

          <button className="rounded-2xl bg-black px-5 py-3 text-sm font-black text-white hover:bg-red-600">
            Apply
          </button>

          <Link
            href="/admin/devices"
            className="rounded-2xl border border-black/10 px-5 py-3 text-center text-sm font-black text-black"
          >
            Clear
          </Link>
        </form>

        {filters.organisationId || filters.userId ? (
          <p className="mt-3 text-xs font-semibold text-black/40">
            A direct organisation/user filter is also active from another Admin surface.
          </p>
        ) : null}
      </AdminPanel>

      <AdminPanel
        eyebrow="Client Registry"
        title="Desktop & Mobile"
        description="No device secret hashes, session tokens or refresh-token hashes are selected into this view."
      >
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-black/15 p-7 text-sm font-semibold text-black/40">
            No devices match this view.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-black/10">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1650px] divide-y divide-black/10 text-sm">
                <thead>
                  <tr>
                    <TableHead>Device</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Organisation</TableHead>
                    <TableHead>Site</TableHead>
                    <TableHead>Registered user</TableHead>
                    <TableHead>Driver</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sessions</TableHead>
                    <TableHead>Last seen</TableHead>
                    <TableHead>Registered</TableHead>
                    <TableHead>Actions</TableHead>
                  </tr>
                </thead>

                <tbody className="divide-y divide-black/10">
                  {rows.map((device) => (
                    <tr key={device.id} className="align-top hover:bg-red-50/30">
                      <TableCell>
                        <div>
                          <Link
                            href={`/admin/devices/${device.id}`}
                            className="font-black text-black hover:text-red-600"
                          >
                            {device.displayName}
                          </Link>
                          <p className="mt-1 font-mono text-[10px] text-black/30">
                            {device.id}
                          </p>
                        </div>
                      </TableCell>

                      <TableCell>
                        <div>
                          <p className="font-black text-black">
                            {formatLabel(device.deviceType)}
                          </p>
                          <p className="mt-1 text-xs text-black/35">
                            {formatLabel(device.platform)}
                          </p>
                        </div>
                      </TableCell>

                      <TableCell>
                        <Link
                          href={`/admin/organisations/${device.organisationId}`}
                          className="font-black text-black hover:text-red-600"
                        >
                          {device.organisationName}
                        </Link>
                      </TableCell>

                      <TableCell>
                        <div>
                          <p>{device.siteName ?? "No default site"}</p>
                          <p className="mt-1 text-xs text-black/35">
                            {device.sitePostcode ?? "—"}
                          </p>
                        </div>
                      </TableCell>

                      <TableCell>
                        {device.registeredByUserId ? (
                          <div>
                            <Link
                              href={`/admin/users/${device.registeredByUserId}`}
                              className="font-black text-black hover:text-red-600"
                            >
                              {device.registeredByName ??
                                device.registeredByEmail ??
                                "Unknown user"}
                            </Link>
                            <p className="mt-1 text-xs text-black/35">
                              {device.registeredByEmail}
                            </p>
                          </div>
                        ) : (
                          "—"
                        )}
                      </TableCell>

                      <TableCell>
                        {device.linkedDriver ? (
                          <div>
                            <p className="font-black text-black">
                              {device.linkedDriver.name}
                            </p>
                            <p className="mt-1 text-xs text-black/35">
                              {formatLabel(device.linkedDriver.mobileAccessStatus)}
                              {device.linkedDriver.defaultVehicleRegistration
                                ? ` · ${device.linkedDriver.defaultVehicleRegistration}`
                                : ""}
                            </p>
                          </div>
                        ) : (
                          "—"
                        )}
                      </TableCell>

                      <TableCell>
                        <AdminStatusPill
                          label={formatLabel(device.status)}
                          tone={statusTone(device.status)}
                        />
                      </TableCell>

                      <TableCell>
                        <div>
                          <p className="font-black text-black">
                            {device.activeSessionCount} active
                          </p>
                          <p className="mt-1 text-xs text-black/35">
                            {device.revokedSessionCount} revoked ·{" "}
                            {device.expiredSessionCount} expired
                          </p>
                        </div>
                      </TableCell>

                      <TableCell>
                        <span
                          className={
                            device.status === "ACTIVE" &&
                            isStale(device.lastSeenAt)
                              ? "font-black text-amber-700"
                              : ""
                          }
                        >
                          {formatDateTime(device.lastSeenAt)}
                        </span>
                      </TableCell>

                      <TableCell>{formatDateTime(device.createdAt)}</TableCell>

                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Link
                            href={`/admin/devices/${device.id}`}
                            className="rounded-full bg-black px-3 py-1.5 text-xs font-black text-white hover:bg-red-600"
                          >
                            Inspect
                          </Link>

                          {device.status === "ACTIVE" ? (
                            <form
                              action={suspendDeviceAction.bind(null, device.id)}
                            >
                              <button
                                type="submit"
                                className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-800"
                              >
                                Suspend
                              </button>
                            </form>
                          ) : null}

                          {device.status === "SUSPENDED" ? (
                            <form
                              action={reactivateDeviceAction.bind(null, device.id)}
                            >
                              <button
                                type="submit"
                                className="rounded-full border border-black/15 px-3 py-1.5 text-xs font-black text-black"
                              >
                                Reactivate
                              </button>
                            </form>
                          ) : null}

                          {device.status !== "REVOKED" ? (
                            <form action={revokeDeviceAction.bind(null, device.id)}>
                              <button
                                type="submit"
                                className="rounded-full border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-black text-red-700"
                              >
                                Revoke
                              </button>
                            </form>
                          ) : null}
                        </div>
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
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "Never";

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
