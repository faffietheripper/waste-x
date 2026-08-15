import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";
import { users } from "@/db/schema";

export type SoloWorkspaceRole =
  | "administrator"
  | "operations"
  | "accounts"
  | "read_only"
  | "employee"
  | "seniorManagement"
  | "platform_admin";

export type SoloWorkspaceAccess = {
  userId: string;
  userName: string;
  organisationId: string;
  organisationName: string;
  role: SoloWorkspaceRole;
  canSeeFinancials: boolean;
  canExportAudit: boolean;
  canManageOrganisation: boolean;
};

const FINANCIAL_ROLES = new Set<SoloWorkspaceRole>([
  "administrator",
  "accounts",
  "seniorManagement",
  "platform_admin",
]);

const AUDIT_EXPORT_ROLES = new Set<SoloWorkspaceRole>([
  "administrator",
  "accounts",
  "seniorManagement",
  "platform_admin",
]);

const MANAGEMENT_ROLES = new Set<SoloWorkspaceRole>([
  "administrator",
  "seniorManagement",
  "platform_admin",
]);

export async function requireSoloWorkspaceAccess(): Promise<SoloWorkspaceAccess> {
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
    currentUser.isSuspended ||
    currentUser.status === "SUSPENDED"
  ) {
    redirect("/home/settings/organisation?reason=no-organisation");
  }

  const role = currentUser.role as SoloWorkspaceRole;

  return {
    userId: currentUser.id,
    userName: currentUser.name,
    organisationId: currentUser.organisationId,
    organisationName: currentUser.organisation.teamName,
    role,
    canSeeFinancials: FINANCIAL_ROLES.has(role),
    canExportAudit: AUDIT_EXPORT_ROLES.has(role),
    canManageOrganisation: MANAGEMENT_ROLES.has(role),
  };
}
