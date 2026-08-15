import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";
import { users } from "@/db/schema";

export type AdminValueAccess = {
  userId: string;
  organisationId: string;
  role: string;
  organisationName: string;
};

const ALLOWED_ROLES = new Set([
  "administrator",
  "accounts",
  "seniorManagement",
  "platform_admin",
]);

export async function requireAdminValueAccess(): Promise<AdminValueAccess> {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const currentUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    with: {
      organisation: true,
    },
  });

  if (
    !currentUser?.organisationId ||
    !currentUser.organisation ||
    !currentUser.isActive ||
    currentUser.isSuspended
  ) {
    redirect("/home");
  }

  if (!ALLOWED_ROLES.has(currentUser.role)) {
    redirect("/home");
  }

  return {
    userId: currentUser.id,
    organisationId: currentUser.organisationId,
    role: currentUser.role,
    organisationName: currentUser.organisation.teamName,
  };
}
