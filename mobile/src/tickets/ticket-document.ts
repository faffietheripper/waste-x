import { Linking } from "react-native";

import { getMobileAuthSnapshot } from "@/auth/mobile-auth";
import { mobileApiBaseUrl } from "@/platform/api";
import {
  getMobileDeviceSecret,
  getMobileSessionToken,
} from "@/storage/secure";

type TicketLinkResponse = {
  ok?: boolean;
  ticketNumber?: string;
  pdfUrl?: string;
  expiresAt?: string;
  error?: {
    code?: string;
    message?: string;
  };
};

export async function openMobileTicketPdf(loadId: string) {
  const auth = await getMobileAuthSnapshot();
  if (!auth.onlineAuthenticated) {
    throw new Error(
      "Connect to Waste X to open the ticket PDF. The ticket number remains available offline.",
    );
  }

  const [sessionToken, deviceSecret] = await Promise.all([
    getMobileSessionToken(),
    getMobileDeviceSecret(),
  ]);
  if (!sessionToken || !deviceSecret) {
    throw new Error("Waste X Mobile authentication is unavailable. Sign in again and retry.");
  }

  const response = await fetch(
    `${mobileApiBaseUrl}/api/mobile/v1/tickets/${encodeURIComponent(loadId)}/link`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        "X-Waste-X-Device-Secret": deviceSecret,
        Accept: "application/json",
      },
    },
  );

  let body: TicketLinkResponse | null = null;
  try {
    body = (await response.json()) as TicketLinkResponse;
  } catch {
    body = null;
  }

  if (!response.ok || !body?.pdfUrl) {
    throw new Error(
      body?.error?.message ??
        "Waste X could not prepare this ticket PDF. Refresh the job and try again.",
    );
  }

  await Linking.openURL(body.pdfUrl);
  return {
    ticketNumber: body.ticketNumber ?? null,
    expiresAt: body.expiresAt ?? null,
  };
}
