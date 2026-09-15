import { desc, eq } from "drizzle-orm";

import {
  clientDevices,
  clientSessions,
  type ClientDeviceStatus,
  type ClientDeviceType,
} from "@/db/client-sync-schema";
import { database } from "@/db/database";
import {
  drivers,
  organisations,
  sites,
  users,
  vehicles,
} from "@/db/schema";

export type AdminDeviceSession = {
  id: string;
  deviceId: string;
  userId: string;
  organisationId: string;
  expiresAt: Date;
  refreshExpiresAt: Date | null;
  lastSeenAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date | null;
};

export type AdminDeviceRow = {
  id: string;
  organisationId: string;
  defaultSiteId: string | null;
  displayName: string;
  deviceType: ClientDeviceType;
  platform: string;
  status: ClientDeviceStatus;
  registeredByUserId: string | null;
  lastSeenAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  organisationName: string;
  siteName: string | null;
  sitePostcode: string | null;
  registeredByName: string | null;
  registeredByEmail: string | null;
  registeredByStatus: string | null;
  registeredByIsActive: boolean | null;
  registeredByIsSuspended: boolean | null;
  linkedDriver: {
    id: string;
    name: string;
    mobileAccessStatus: string;
    isActive: boolean;
    defaultVehicleRegistration: string | null;
  } | null;
  sessions: AdminDeviceSession[];
  activeSessionCount: number;
  revokedSessionCount: number;
  expiredSessionCount: number;
  latestSessionSeenAt: Date | null;
};

export type AdminDeviceFilters = {
  search?: string;
  status?: ClientDeviceStatus;
  deviceType?: ClientDeviceType;
  organisationId?: string;
  userId?: string;
};

function latestDate(values: Array<Date | null | undefined>) {
  const timestamps = values
    .filter((value): value is Date => value instanceof Date)
    .map((value) => value.getTime());

  return timestamps.length ? new Date(Math.max(...timestamps)) : null;
}

function normalise(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export async function getAdminDevices(filters: AdminDeviceFilters = {}) {
  const now = new Date();

  /*
    SECURITY BOUNDARY:
    Never select clientDevices.secretHash, clientSessions.tokenHash,
    or clientSessions.refreshTokenHash into Platform Admin.
  */
  const [deviceRows, sessionRows, driverRows] = await Promise.all([
    database
      .select({
        id: clientDevices.id,
        organisationId: clientDevices.organisationId,
        defaultSiteId: clientDevices.defaultSiteId,
        displayName: clientDevices.displayName,
        deviceType: clientDevices.deviceType,
        platform: clientDevices.platform,
        status: clientDevices.status,
        registeredByUserId: clientDevices.registeredByUserId,
        lastSeenAt: clientDevices.lastSeenAt,
        revokedAt: clientDevices.revokedAt,
        createdAt: clientDevices.createdAt,
        updatedAt: clientDevices.updatedAt,
        organisationName: organisations.teamName,
        siteName: sites.name,
        sitePostcode: sites.postcode,
        registeredByName: users.name,
        registeredByEmail: users.email,
        registeredByStatus: users.status,
        registeredByIsActive: users.isActive,
        registeredByIsSuspended: users.isSuspended,
      })
      .from(clientDevices)
      .innerJoin(
        organisations,
        eq(clientDevices.organisationId, organisations.id),
      )
      .leftJoin(sites, eq(clientDevices.defaultSiteId, sites.id))
      .leftJoin(users, eq(clientDevices.registeredByUserId, users.id))
      .orderBy(desc(clientDevices.createdAt)),

    database
      .select({
        id: clientSessions.id,
        deviceId: clientSessions.deviceId,
        userId: clientSessions.userId,
        organisationId: clientSessions.organisationId,
        expiresAt: clientSessions.expiresAt,
        refreshExpiresAt: clientSessions.refreshExpiresAt,
        lastSeenAt: clientSessions.lastSeenAt,
        revokedAt: clientSessions.revokedAt,
        createdAt: clientSessions.createdAt,
      })
      .from(clientSessions)
      .orderBy(desc(clientSessions.createdAt)),

    database
      .select({
        id: drivers.id,
        organisationId: drivers.organisationId,
        linkedUserId: drivers.linkedUserId,
        name: drivers.name,
        mobileAccessStatus: drivers.mobileAccessStatus,
        isActive: drivers.isActive,
        defaultVehicleRegistration: vehicles.registrationNumber,
      })
      .from(drivers)
      .leftJoin(vehicles, eq(drivers.defaultVehicleId, vehicles.id)),
  ]);

  const sessionsByDevice = new Map<string, AdminDeviceSession[]>();
  for (const session of sessionRows) {
    const current = sessionsByDevice.get(session.deviceId) ?? [];
    current.push(session);
    sessionsByDevice.set(session.deviceId, current);
  }

  const driverByUser = new Map<string, (typeof driverRows)[number]>();
  for (const driver of driverRows) {
    if (driver.linkedUserId) driverByUser.set(driver.linkedUserId, driver);
  }

  const rows: AdminDeviceRow[] = deviceRows.map((device) => {
    const sessions = sessionsByDevice.get(device.id) ?? [];
    const activeSessionCount = sessions.filter(
      (session) => !session.revokedAt && session.expiresAt > now,
    ).length;
    const revokedSessionCount = sessions.filter(
      (session) => Boolean(session.revokedAt),
    ).length;
    const expiredSessionCount = sessions.filter(
      (session) => !session.revokedAt && session.expiresAt <= now,
    ).length;

    const linkedDriverRaw = device.registeredByUserId
      ? driverByUser.get(device.registeredByUserId)
      : undefined;

    const linkedDriver =
      linkedDriverRaw &&
      linkedDriverRaw.organisationId === device.organisationId
        ? {
            id: linkedDriverRaw.id,
            name: linkedDriverRaw.name,
            mobileAccessStatus: linkedDriverRaw.mobileAccessStatus,
            isActive: linkedDriverRaw.isActive,
            defaultVehicleRegistration:
              linkedDriverRaw.defaultVehicleRegistration,
          }
        : null;

    return {
      ...device,
      linkedDriver,
      sessions,
      activeSessionCount,
      revokedSessionCount,
      expiredSessionCount,
      latestSessionSeenAt: latestDate(
        sessions.map((session) => session.lastSeenAt ?? session.createdAt),
      ),
    };
  });

  const search = normalise(filters.search);

  return rows.filter((row) => {
    if (filters.status && row.status !== filters.status) return false;
    if (filters.deviceType && row.deviceType !== filters.deviceType) return false;
    if (
      filters.organisationId &&
      row.organisationId !== filters.organisationId
    ) {
      return false;
    }
    if (filters.userId && row.registeredByUserId !== filters.userId) return false;

    if (!search) return true;

    return [
      row.displayName,
      row.id,
      row.organisationName,
      row.siteName,
      row.sitePostcode,
      row.registeredByName,
      row.registeredByEmail,
      row.linkedDriver?.name,
      row.linkedDriver?.defaultVehicleRegistration,
      row.platform,
      row.deviceType,
      row.status,
    ].some((value) => normalise(value).includes(search));
  });
}

export async function getAdminDevice(deviceId: string) {
  const rows = await getAdminDevices();
  return rows.find((row) => row.id === deviceId) ?? null;
}
