import Link from "next/link";
import type { ReactNode } from "react";

import { requireSoloRouteAccess } from "@/modules/solo-permissions/core/soloRouteAccess";

export default async function PermissionLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireSoloRouteAccess("rates:view");

  return (
    <>
      <div className="fixed left-[20vw] right-0 top-[13vh] z-30 border-b border-orange-200 bg-orange-50 px-8 py-2 text-center text-[11px] font-semibold text-orange-900 shadow-sm">
        Rate Library is now reference/history only. Confirm the actual price against
        each Job in{" "}
        <Link href="/home/commercial#job-pricing" className="underline underline-offset-2">
          Commercial & Invoicing
        </Link>
        .
      </div>
      <div className="pt-10">{children}</div>
    </>
  );
}
