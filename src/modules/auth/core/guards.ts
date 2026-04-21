import { hasPermission, Capability } from "./permissions";

export function requirePermission(
  capabilities: Capability[],
  permission: Parameters<typeof hasPermission>[1],
) {
  if (!hasPermission(capabilities, permission)) {
    throw new Error("FORBIDDEN");
  }
}
