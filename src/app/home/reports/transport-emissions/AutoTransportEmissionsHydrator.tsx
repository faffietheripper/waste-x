"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

import { autoCalculateTransportEmissionsAction } from "./actions";

export default function AutoTransportEmissionsHydrator({
  pendingCount,
  signature,
}: {
  pendingCount: number;
  signature: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (pendingCount <= 0) return;

    const storageKey = `waste-x:transport-auto:${signature}`;

    /*
      Prevent a broken external route from causing an endless refresh loop in
      one browser session. A manual reload/retry can attempt it again later.
    */
    if (window.sessionStorage.getItem(storageKey)) return;
    window.sessionStorage.setItem(storageKey, "1");

    startTransition(async () => {
      const result = await autoCalculateTransportEmissionsAction();

      if (result.ok && result.calculatedLoads > 0) {
        router.refresh();
      }
    });
  }, [pendingCount, router, signature]);

  return null;
}
