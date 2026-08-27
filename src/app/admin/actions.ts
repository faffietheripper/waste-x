"use server";

import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";
import {
  getAdminAuditFeed,
  getAdminControlTowerData,
} from "@/modules/admin/core/getAdminControlTowerData";
import { getAdminWorkflowHealth } from "@/modules/admin/core/getAdminWorkflowHealth";

/*
  Compatibility entry point retained for older internal callers.
  Marketplace listings/bids/assignments remain in the schema for future network
  phases, but they are no longer the primary Platform Dashboard model.
*/
export async function getPlatformDashboardStats() {
  await requirePlatformAdmin();
  const [core, workflows] = await Promise.all([
    getAdminControlTowerData(),
    getAdminWorkflowHealth(30),
  ]);

  return {
    organisations: core.organisations,
    users: core.users,
    operations: workflows.operations,
    dwt: core.dwt,
    returns: workflows.returns,
    carbon: workflows.carbon,
    commercial: workflows.commercial,
    billing: workflows.billing,
    support: core.support,
    system: core.system,
  };
}

export async function getRecentAuditEvents() {
  await requirePlatformAdmin();
  return getAdminAuditFeed(100);
}
