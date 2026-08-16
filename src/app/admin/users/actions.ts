"use server";

import { database } from "@/db/database";
import { users, organisations, wasteListings, bids } from "@/db/schema";
import { desc, eq, ilike, or, sql } from "drizzle-orm";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";
import { revalidatePath } from "next/cache";

export async function getAllPlatformUsers(search?: string) {
  await requirePlatformAdmin();

  const whereClause = search
    ? or(ilike(users.name, `%${search}%`), ilike(users.email, `%${search}%`))
    : undefined;

  return database
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      isActive: users.isActive,
      isSuspended: users.isSuspended,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
      organisationName: organisations.teamName,
      listingsCount: sql<number>`
        (select count(*) from bb_waste_listing wl where wl."userId" = ${users.id})
      `,
      bidsCount: sql<number>`
        (select count(*) from bb_bids b where b."userId" = ${users.id})
      `,
    })
    .from(users)
    .leftJoin(organisations, eq(users.organisationId, organisations.id))
    .where(whereClause)
    .orderBy(desc(users.createdAt));
}

export async function suspendUser(userId: string) {
  await requirePlatformAdmin();

  const target = await database.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, role: true },
  });

  if (!target) throw new Error("User not found");
  if (target.role === "platform_admin") {
    throw new Error("Platform admin accounts cannot be suspended from this action.");
  }

  await database
    .update(users)
    .set({ isSuspended: true, isActive: false })
    .where(eq(users.id, userId));

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
}

export async function reactivateUser(userId: string) {
  await requirePlatformAdmin();

  await database
    .update(users)
    .set({ isSuspended: false, isActive: true })
    .where(eq(users.id, userId));

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
}

export async function getPlatformUserById(userId: string) {
  await requirePlatformAdmin();

  const [user] = await database
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      isActive: users.isActive,
      isSuspended: users.isSuspended,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
      organisationName: organisations.teamName,
      listingsCount: sql<number>`
        (select count(*) from bb_waste_listing wl where wl."userId" = ${users.id})
      `,
      bidsCount: sql<number>`
        (select count(*) from bb_bids b where b."userId" = ${users.id})
      `,
    })
    .from(users)
    .leftJoin(organisations, eq(users.organisationId, organisations.id))
    .where(eq(users.id, userId));

  return user;
}
