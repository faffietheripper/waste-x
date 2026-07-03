// src/modules/digital-waste-tracking/core/getDefraAccessToken.ts

import { Buffer } from "buffer";

type DefraTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
};

function cleanEnv(value: string | undefined) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

export async function getDefraAccessToken(): Promise<string> {
  const authUrl = cleanEnv(process.env.DEFRA_WASTE_TRACKING_AUTH_URL);
  const clientId = cleanEnv(process.env.DEFRA_WASTE_TRACKING_CLIENT_ID);
  const clientSecret = cleanEnv(process.env.DEFRA_WASTE_TRACKING_CLIENT_SECRET);

  if (!authUrl) {
    throw new Error(
      "Missing DEFRA_WASTE_TRACKING_AUTH_URL environment variable.",
    );
  }

  if (!clientId) {
    throw new Error(
      "Missing DEFRA_WASTE_TRACKING_CLIENT_ID environment variable.",
    );
  }

  if (!clientSecret) {
    throw new Error(
      "Missing DEFRA_WASTE_TRACKING_CLIENT_SECRET environment variable.",
    );
  }

  const encodedCredentials = Buffer.from(
    `${clientId}:${clientSecret}`,
  ).toString("base64");

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetch(`${authUrl}/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${encodedCredentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  const text = await response.text();

  let parsed: DefraTokenResponse | null = null;

  try {
    parsed = JSON.parse(text) as DefraTokenResponse;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    throw new Error(
      `Defra token request failed with status ${response.status}. ${
        text || "No response body returned."
      }`,
    );
  }

  if (!parsed?.access_token) {
    throw new Error(
      "Defra token request succeeded but no access_token was returned.",
    );
  }

  return parsed.access_token;
}