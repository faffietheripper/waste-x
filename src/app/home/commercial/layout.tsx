import type { ReactNode } from "react";

import { requireSoloRouteAccess } from "@/modules/solo-permissions/core/soloRouteAccess";

export default async function CommercialLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireSoloRouteAccess("accounts:view");
  return children;
}
