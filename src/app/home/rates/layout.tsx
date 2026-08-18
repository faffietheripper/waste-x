import type { ReactNode } from "react";

import { requireSoloRouteAccess } from "@/modules/solo-permissions/core/soloRouteAccess";

export default async function PermissionLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireSoloRouteAccess("rates:view");

  return children;
}
