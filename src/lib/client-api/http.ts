import { NextResponse } from "next/server";

import { ClientApiAuthError } from "./auth";

export const DESKTOP_API_VERSION = "desktop-v1" as const;

export function clientApiJson<T extends Record<string, unknown>>(
  body: T,
  init?: ResponseInit,
) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Waste-X-Api-Version", DESKTOP_API_VERSION);

  return NextResponse.json(
    {
      apiVersion: DESKTOP_API_VERSION,
      ...body,
    },
    {
      ...init,
      headers,
    },
  );
}

export function clientApiError(
  code: string,
  status: number,
  message: string,
  details?: unknown,
) {
  return clientApiJson(
    {
      ok: false,
      error: {
        code,
        message,
        ...(details === undefined ? {} : { details }),
      },
    },
    { status },
  );
}

export function handleClientApiError(error: unknown) {
  if (error instanceof ClientApiAuthError) {
    return clientApiError(error.code, error.status, error.message);
  }

  console.error("[CLIENT_API] Unhandled error", error);
  return clientApiError(
    "INTERNAL_ERROR",
    500,
    "Waste X could not complete this request.",
  );
}
