#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const readline = require("readline");
const { Writable } = require("stream");

const baseUrl = (process.env.WASTE_X_SMOKE_BASE_URL || "http://localhost:3000").replace(/\/$/, "");

class MutedOutput extends Writable {
  constructor() {
    super();
    this.muted = false;
  }

  _write(chunk, encoding, callback) {
    if (!this.muted) process.stdout.write(chunk, encoding);
    callback();
  }
}

function prompt(question, { hidden = false } = {}) {
  if (!process.stdin.isTTY) {
    throw new Error(`Interactive input is required for: ${question.trim()}`);
  }

  const output = new MutedOutput();
  const rl = readline.createInterface({
    input: process.stdin,
    output,
    terminal: true,
  });

  return new Promise((resolve) => {
    if (hidden) output.muted = true;
    rl.question(question, (answer) => {
      output.muted = false;
      if (hidden) process.stdout.write("\n");
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function jsonRequest(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      accept: "application/json",
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });

  let body;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  return { response, body };
}

function authenticatedHeaders(sessionToken, deviceSecret) {
  return {
    authorization: `Bearer ${sessionToken}`,
    "x-waste-x-device-secret": deviceSecret,
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function describeFailure(label, result) {
  const code = result.body?.error?.code || result.body?.code || "UNKNOWN";
  return `${label} failed (HTTP ${result.response.status}, ${code}).`;
}

function payloadHash(payload) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload ?? null))
    .digest("hex");
}

async function main() {
  console.log("Waste X Desktop Cloud API smoke test");
  console.log(`Target: ${baseUrl}`);
  console.log("This test never prints your password, device secret, or session token.\n");

  const health = await jsonRequest("/api/desktop/v1/health");
  assert(
    health.response.ok && health.body?.ok === true && health.body?.database === "reachable",
    describeFailure("Health check", health),
  );
  console.log("✓ Health: Cloud API and PostgreSQL reachable");

  const email = process.env.WASTE_X_SMOKE_EMAIL || (await prompt("Waste X email: "));
  const password = process.env.WASTE_X_SMOKE_PASSWORD || (await prompt("Waste X password: ", { hidden: true }));

  assert(email, "Waste X email is required.");
  assert(password, "Waste X password is required.");

  let deviceId = null;
  let deviceSecret = null;
  let sessionToken = null;
  let revoked = false;

  try {
    const provision = await jsonRequest("/api/desktop/v1/auth/provision", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        displayName: `Desktop API Smoke Test ${new Date().toISOString()}`,
        platform: process.platform === "darwin" ? "MACOS" : process.platform === "win32" ? "WINDOWS" : "LINUX",
        defaultSiteId: null,
      }),
    });

    assert(
      provision.response.status === 201 && provision.body?.ok === true,
      describeFailure("Provision", provision),
    );

    deviceId = provision.body.device?.deviceId;
    deviceSecret = provision.body.credentials?.deviceSecret;
    sessionToken = provision.body.credentials?.sessionToken;

    assert(deviceId && deviceSecret && sessionToken, "Provision response did not contain the expected Desktop credentials.");
    console.log(`✓ Provision: temporary Desktop device created (${deviceId})`);

    const login = await jsonRequest("/api/desktop/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, deviceId, deviceSecret }),
    });

    assert(
      login.response.ok && login.body?.ok === true && login.body?.session?.token,
      describeFailure("Login", login),
    );

    sessionToken = login.body.session.token;
    const organisationId = login.body.user?.organisationId;
    const actorUserId = login.body.user?.id;
    assert(organisationId && actorUserId, "Login response is missing organisation/user context.");
    console.log("✓ Login: device + user credentials accepted");

    const bootstrap = await jsonRequest("/api/desktop/v1/bootstrap", {
      headers: authenticatedHeaders(sessionToken, deviceSecret),
    });

    assert(
      bootstrap.response.ok &&
        bootstrap.body?.ok === true &&
        bootstrap.body?.device?.deviceId === deviceId &&
        bootstrap.body?.workingSet?.forwardDays === 14,
      describeFailure("Bootstrap", bootstrap),
    );
    console.log(
      `✓ Bootstrap: ${bootstrap.body.jobs?.length ?? 0} jobs, ${bootstrap.body.jobLoads?.length ?? 0} loads, 14-day working horizon`,
    );

    const pull = await jsonRequest("/api/desktop/v1/sync/pull", {
      method: "POST",
      headers: authenticatedHeaders(sessionToken, deviceSecret),
      body: JSON.stringify({
        protocolVersion: 1,
        deviceId,
        cursor: bootstrap.body.syncCursor ?? null,
        limit: 25,
      }),
    });

    assert(pull.response.ok && pull.body?.ok === true, describeFailure("Sync pull", pull));
    console.log(`✓ Pull: cursor accepted, ${pull.body.changes?.length ?? 0} newer changes returned`);

    const wrongDevicePull = await jsonRequest("/api/desktop/v1/sync/pull", {
      method: "POST",
      headers: authenticatedHeaders(sessionToken, deviceSecret),
      body: JSON.stringify({
        protocolVersion: 1,
        deviceId: crypto.randomUUID(),
        cursor: null,
        limit: 1,
      }),
    });

    assert(
      wrongDevicePull.response.status === 403,
      `Device tenancy/mismatch check should return HTTP 403 but returned ${wrongDevicePull.response.status}.`,
    );
    console.log("✓ Device isolation: mismatched device request rejected");

    const payload = {};
    const now = new Date().toISOString();
    const event = {
      schemaVersion: 1,
      eventId: crypto.randomUUID(),
      organisationId,
      siteId: null,
      deviceId,
      actorUserId,
      entityType: "job_load",
      entityId: `desktop-smoke-missing-load-${crypto.randomUUID()}`,
      eventType: "LOAD_DETAILS_UPDATED",
      baseVersion: null,
      deviceSequence: 1,
      occurredAt: now,
      recordedAt: now,
      payload,
      payloadHash: payloadHash(payload),
    };

    const pushBody = {
      protocolVersion: 1,
      deviceId,
      batchId: `desktop-smoke-${Date.now()}`,
      events: [event],
    };

    const firstPush = await jsonRequest("/api/desktop/v1/sync/push", {
      method: "POST",
      headers: authenticatedHeaders(sessionToken, deviceSecret),
      body: JSON.stringify(pushBody),
    });

    const firstResult = firstPush.body?.results?.[0];
    assert(
      firstPush.response.ok &&
        firstPush.body?.ok === true &&
        firstResult?.status === "REJECTED" &&
        firstResult?.reasonCode === "LOAD_NOT_FOUND",
      describeFailure("First idempotency push", firstPush),
    );
    console.log("✓ Push: invalid test operation safely rejected and receipt persisted");

    const duplicatePush = await jsonRequest("/api/desktop/v1/sync/push", {
      method: "POST",
      headers: authenticatedHeaders(sessionToken, deviceSecret),
      body: JSON.stringify(pushBody),
    });

    const duplicateResult = duplicatePush.body?.results?.[0];
    assert(
      duplicatePush.response.ok &&
        duplicatePush.body?.ok === true &&
        duplicateResult?.status === "DUPLICATE",
      describeFailure("Duplicate idempotency push", duplicatePush),
    );
    console.log("✓ Idempotency: exact same event returned DUPLICATE");

    const revoke = await jsonRequest("/api/desktop/v1/auth/device", {
      method: "DELETE",
      headers: authenticatedHeaders(sessionToken, deviceSecret),
    });

    assert(
      revoke.response.ok && revoke.body?.ok === true && revoke.body?.revoked === true,
      describeFailure("Device revocation", revoke),
    );
    revoked = true;
    console.log("✓ Revocation: temporary Desktop device revoked");

    const afterRevoke = await jsonRequest("/api/desktop/v1/bootstrap", {
      headers: authenticatedHeaders(sessionToken, deviceSecret),
    });

    assert(
      afterRevoke.response.status === 401,
      `Revoked device should be rejected with HTTP 401 but returned ${afterRevoke.response.status}.`,
    );
    console.log("✓ Revocation enforcement: revoked credentials rejected");

    console.log("\nPASS — Waste X Desktop Cloud API V1 smoke test completed successfully.");
  } finally {
    if (!revoked && deviceId && deviceSecret && sessionToken) {
      try {
        await jsonRequest("/api/desktop/v1/auth/device", {
          method: "DELETE",
          headers: authenticatedHeaders(sessionToken, deviceSecret),
        });
        console.log("Cleanup: temporary Desktop device revocation attempted.");
      } catch {
        console.warn(`Cleanup warning: manually revoke temporary device ${deviceId} if it remains active.`);
      }
    }
  }
}

main().catch((error) => {
  console.error(`\nFAIL — ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
