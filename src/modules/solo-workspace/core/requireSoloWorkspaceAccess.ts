import { getCurrentSoloPermissionContext } from "@/modules/solo-permissions/core/requireSoloPermission";

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

export async function requireSoloWorkspaceAccess(): Promise<SoloWorkspaceAccess> {
  const context = await getCurrentSoloPermissionContext();

  return {
    userId: context.userId,
    userName: context.userName,
    organisationId: context.organisationId,
    organisationName: context.organisationName,
    role: context.role as SoloWorkspaceRole,

    canSeeFinancials:
      context.role === "platform_admin" ||
      context.permissions.has("accounts:view") ||
      context.permissions.has("reports:financial"),

    canExportAudit:
      context.role === "platform_admin" ||
      context.permissions.has("activity:export"),

    canManageOrganisation:
      context.role === "platform_admin" ||
      context.permissions.has("permissions:manage"),
  };
}
