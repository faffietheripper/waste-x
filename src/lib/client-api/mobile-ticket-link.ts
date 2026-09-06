import crypto from "node:crypto";

const MOBILE_TICKET_LINK_TTL_SECONDS = 5 * 60;

type MobileTicketLinkPayload = {
  v: 1;
  loadId: string;
  userId: string;
  organisationId: string;
  exp: number;
};

function signingSecret() {
  const secret = process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim();
  if (!secret) {
    throw new Error("Waste X ticket-link signing secret is not configured.");
  }
  return secret;
}

function sign(encodedPayload: string) {
  return crypto
    .createHmac("sha256", signingSecret())
    .update(`waste-x-mobile-ticket-v1.${encodedPayload}`)
    .digest("base64url");
}

export function createMobileTicketLinkToken(input: {
  loadId: string;
  userId: string;
  organisationId: string;
}) {
  const expiresAt = Math.floor(Date.now() / 1000) + MOBILE_TICKET_LINK_TTL_SECONDS;
  const payload: MobileTicketLinkPayload = {
    v: 1,
    loadId: input.loadId,
    userId: input.userId,
    organisationId: input.organisationId,
    exp: expiresAt,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return {
    token: `${encodedPayload}.${sign(encodedPayload)}`,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
  };
}

export function verifyMobileTicketLinkToken(token: string): MobileTicketLinkPayload | null {
  const [encodedPayload, encodedSignature, extra] = token.split(".");
  if (!encodedPayload || !encodedSignature || extra) return null;

  let suppliedSignature: Buffer;
  let expectedSignature: Buffer;
  try {
    suppliedSignature = Buffer.from(encodedSignature, "base64url");
    expectedSignature = Buffer.from(sign(encodedPayload), "base64url");
  } catch {
    return null;
  }

  if (
    suppliedSignature.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(suppliedSignature, expectedSignature)
  ) {
    return null;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (!payload || typeof payload !== "object") return null;
  const candidate = payload as Partial<MobileTicketLinkPayload>;
  if (
    candidate.v !== 1 ||
    typeof candidate.loadId !== "string" ||
    !candidate.loadId ||
    typeof candidate.userId !== "string" ||
    !candidate.userId ||
    typeof candidate.organisationId !== "string" ||
    !candidate.organisationId ||
    typeof candidate.exp !== "number" ||
    !Number.isInteger(candidate.exp) ||
    candidate.exp <= Math.floor(Date.now() / 1000)
  ) {
    return null;
  }

  return candidate as MobileTicketLinkPayload;
}
