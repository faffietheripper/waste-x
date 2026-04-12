import crypto from "crypto";

export function generateInviteToken() {
  const rawToken = crypto.randomBytes(32).toString("hex");

  const hashedToken = crypto
    .createHash("sha256")
    .update(rawToken)
    .digest("hex");

  const expiry = new Date(Date.now() + 1000 * 60 * 60 * 24);

  return {
    rawToken,
    hashedToken,
    expiry,
  };
}
