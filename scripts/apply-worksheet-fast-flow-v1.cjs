#!/usr/bin/env node
"use strict";

/*
  WASTE X — DAILY OPERATIONS FAST FLOW V1

  Changes:
  1) TransportAssignmentPopover renders through a document.body portal as a
     page-level modal, so table/card overflow cannot clip it.
  2) Normal incoming flow becomes:
       planned -> Accept / mark arrived -> accepted -> weight -> complete
     The existing "arrived" state remains available for exceptions:
       - permit mismatch records factual arrival and leaves the load arrived
       - legacy/existing arrived loads can still be accepted
       - arrived loads can still be rejected
  3) No database/schema migration.

  Safety:
  - demo branch required unless WASTE_X_ALLOW_NON_DEMO=1
  - every target is transformed in memory first
  - nothing is written until ALL target transforms validate
*/

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = process.cwd();
const SENTINEL = "WASTE_X_WORKSHEET_FAST_FLOW_V1";

function die(message) {
  console.error("\nPATCH ABORTED");
  console.error(message);
  process.exit(1);
}

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) die(`Missing required file: ${rel}`);
  return fs.readFileSync(abs, "utf8");
}

function replaceOnce(text, oldValue, newValue, label) {
  const count = text.split(oldValue).length - 1;
  if (count !== 1) {
    throw new Error(
      `${label}: expected exactly 1 matching block, found ${count}. ` +
      `Your local file differs from the bundle base.`
    );
  }
  return text.replace(oldValue, newValue);
}

function replaceLastOnce(text, oldValue, newValue, label) {
  const index = text.lastIndexOf(oldValue);
  if (index === -1) {
    throw new Error(`${label}: expected closing block was not found.`);
  }
  if (text.lastIndexOf(oldValue, index - 1) !== -1) {
    throw new Error(`${label}: closing block is not unique.`);
  }
  return text.slice(0, index) + newValue + text.slice(index + oldValue.length);
}

function addSentinel(text) {
  if (text.includes(SENTINEL)) return text;
  return `/* ${SENTINEL} */\n${text}`;
}

let branch = "";
try {
  branch = execFileSync("git", ["branch", "--show-current"], {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();
} catch {
  die("Could not determine the current Git branch.");
}

console.log(`Branch: ${branch}`);

if (branch !== "demo" && process.env.WASTE_X_ALLOW_NON_DEMO !== "1") {
  die(
    `This bundle is intended for the demo branch. Current branch: ${branch || "(detached)"}.`
  );
}

const targets = new Map();

try {
  // ---------------------------------------------------------------------------
  // 1. TransportAssignmentPopover.tsx — render editor outside table overflow.
  // ---------------------------------------------------------------------------
  {
    const rel = "src/app/home/worksheet/TransportAssignmentPopover.tsx";
    let text = read(rel);

    if (!text.includes(SENTINEL)) {
      text = replaceOnce(
        text,
        `import { FormEvent, useMemo, useState, useTransition } from "react";`,
        `import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { createPortal } from "react-dom";`,
        `${rel}: React/portal imports`,
      );

      text = replaceOnce(
        text,
        `  const incomplete = !load.driverId || !load.vehicleId;

  function changeProvider(value: string) {`,
        `  const incomplete = !load.driverId || !load.vehicleId;

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function changeProvider(value: string) {`,
        `${rel}: modal lifecycle`,
      );

      const oldOpen = `      {open && (
        <>
          <button
            type="button"
            aria-label="Close transport editor"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-20 cursor-default"
          />

          <div className="absolute left-0 z-30 mt-2 w-[560px] rounded-2xl border border-black/10 bg-white p-4 shadow-2xl">`;

      const newOpen = `      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 px-4 py-6 backdrop-blur-[2px]"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setOpen(false);
              }
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Edit actual transport"
              className="max-h-[calc(100vh-3rem)] w-full max-w-[620px] overflow-y-auto rounded-[24px] border border-black/10 bg-white p-5 shadow-2xl"
              onMouseDown={(event) => event.stopPropagation()}
            >`;

      text = replaceOnce(
        text,
        oldOpen,
        newOpen,
        `${rel}: clipped popover -> page modal`,
      );

      text = replaceLastOnce(
        text,
        `          </div>
        </>
      )}`,
        `            </div>
          </div>,
          document.body,
        )}`,
        `${rel}: portal close`,
      );

      if (!text.includes(`createPortal(`)) {
        throw new Error(`${rel}: portal marker missing after transform.`);
      }
      if (text.includes(`absolute left-0 z-30 mt-2 w-[560px]`)) {
        throw new Error(`${rel}: old clipped popover positioning remains.`);
      }

      text = addSentinel(text);
    }

    targets.set(rel, text);
  }

  // ---------------------------------------------------------------------------
  // 2. actions.ts — combine normal arrival + acceptance into one server action.
  // ---------------------------------------------------------------------------
  {
    const rel = "src/app/home/worksheet/actions.ts";
    let text = read(rel);

    if (!text.includes(SENTINEL)) {
      const oldAction = `export async function markLoadArrivedAction(formData: FormData) {
  const { organisationId } = await requireOperationsAccess();
  const returnDate = getReturnDate(formData);
  const loadId = cleanString(formData.get("loadId"));
  const load = await getLoadOrRedirect(loadId, organisationId, returnDate);

  if (load.direction !== "incoming") {
    worksheetRedirect(returnDate, "error", "incoming_only_action");
  }

  if (load.status !== "planned") {
    worksheetRedirect(returnDate, "error", "load_not_planned");
  }

  const now = new Date();

  await database
    .update(jobLoads)
    .set({
      status: "arrived",
      receivedAt: load.receivedAt ?? now,
      movementAt: load.movementAt ?? now,
      updatedAt: now,
    })
    .where(
      and(
        eq(jobLoads.id, load.id),
        eq(jobLoads.organisationId, organisationId),
      ),
    );

  await syncJobStatus(load.jobId, organisationId);
  revalidateOperations(load.jobId);
  worksheetRedirect(returnDate, "success", "load_arrived");
}`;

      const newAction = `export async function markLoadArrivedAction(formData: FormData) {
  const { organisationId } = await requireOperationsAccess();
  const returnDate = getReturnDate(formData);
  const loadId = cleanString(formData.get("loadId"));
  const load = await getLoadOrRedirect(loadId, organisationId, returnDate);

  if (load.direction !== "incoming") {
    worksheetRedirect(returnDate, "error", "incoming_only_action");
  }

  if (load.status !== "planned") {
    worksheetRedirect(returnDate, "error", "load_not_planned");
  }

  /*
    Fast-path check-in:
    The normal yard workflow should not require separate "Arrived" and "Accept"
    clicks when the operator is not adding any information between them.

    We still preserve "arrived" as a meaningful exception state. If the vehicle
    physically presents but the EWC is not permitted, Waste X records the
    factual arrival, leaves the load at "arrived", and lets the operator reject
    or correct the load instead of pretending it was accepted.
  */
  if (!load.wasteDescriptionSnapshot?.trim()) {
    worksheetRedirect(returnDate, "error", "waste_description_required");
  }

  const driverId = load.driverId;
  const vehicleId = load.vehicleId;

  if (!driverId) {
    worksheetRedirect(returnDate, "error", "driver_required");
  }

  if (!vehicleId) {
    worksheetRedirect(returnDate, "error", "vehicle_required");
  }

  const driverError = await validateDriver(
    driverId,
    organisationId,
    load.haulierCounterpartyId,
  );

  if (driverError) {
    worksheetRedirect(returnDate, "error", driverError);
  }

  const vehicleError = await validateVehicle(
    vehicleId,
    organisationId,
    load.haulierCounterpartyId,
  );

  if (vehicleError) {
    worksheetRedirect(returnDate, "error", vehicleError);
  }

  const permitMatch = await incomingPermitAllowsLoad({
    organisationId,
    permitId: load.sitePermitId,
    siteId: load.ownSiteId,
    ewcCodeId: load.ewcCodeId,
  });

  const now = new Date();
  const arrivalFields = {
    receivedAt: load.receivedAt ?? now,
    movementAt: load.movementAt ?? now,
    updatedAt: now,
  };

  if (!permitMatch) {
    await database
      .update(jobLoads)
      .set({
        ...arrivalFields,
        status: "arrived",
      })
      .where(
        and(
          eq(jobLoads.id, load.id),
          eq(jobLoads.organisationId, organisationId),
        ),
      );

    await syncJobStatus(load.jobId, organisationId);
    revalidateOperations(load.jobId);
    worksheetRedirect(returnDate, "error", "permit_mismatch");
  }

  await database
    .update(jobLoads)
    .set({
      ...arrivalFields,
      status: "accepted",
    })
    .where(
      and(
        eq(jobLoads.id, load.id),
        eq(jobLoads.organisationId, organisationId),
      ),
    );

  await syncJobStatus(load.jobId, organisationId);
  revalidateOperations(load.jobId);
  worksheetRedirect(returnDate, "success", "load_arrived_and_accepted");
}`;

      text = replaceOnce(
        text,
        oldAction,
        newAction,
        `${rel}: combined arrival/accept action`,
      );

      if (!text.includes(`status: "accepted",`)) {
        throw new Error(`${rel}: accepted fast-path marker missing.`);
      }
      if (!text.includes(`worksheetRedirect(returnDate, "error", "permit_mismatch");`)) {
        throw new Error(`${rel}: exception-state permit handling missing.`);
      }

      text = addSentinel(text);
    }

    targets.set(rel, text);
  }

  // ---------------------------------------------------------------------------
  // 3. page.tsx — simplify normal operator path and copy.
  // ---------------------------------------------------------------------------
  {
    const rel = "src/app/home/worksheet/page.tsx";
    let text = read(rel);

    if (!text.includes(SENTINEL)) {
      text = replaceOnce(
        text,
        `                One row per load. Mark arrival, capture weight, accept and complete
                without reopening the job.`,
        `                One row per load. Accept the arrival, capture weight and complete
                without reopening the job.`,
        `${rel}: hero workflow copy`,
      );

      text = replaceOnce(
        text,
        `                  : "Normal path: Arrived → Weight → Accept → Complete"}`,
        `                  : "Normal path: Accept / arrive → Weight → Complete"}`,
        `${rel}: board workflow copy`,
      );

      text = replaceOnce(
        text,
        `  load_arrived: "Load marked as arrived.",
  load_details_saved: "Load details saved.",
  load_accepted: "Load accepted against the receiving permit.",`,
        `  load_arrived: "Load marked as arrived.",
  load_arrived_and_accepted:
    "Load marked as arrived and accepted against the receiving permit.",
  load_details_saved: "Load details saved.",
  load_accepted: "Load accepted against the receiving permit.",`,
        `${rel}: combined success message`,
      );

      const oldPlanned = `  if (load.direction === "incoming" && load.status === "planned") {
    return (
      <form action={markLoadArrivedAction}>
        <input type="hidden" name="loadId" value={load.id} />
        <input type="hidden" name="returnDate" value={returnDate} />
        <button className="w-full rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-500">
          Mark arrived
        </button>
      </form>
    );
  }`;

      const newPlanned = `  if (load.direction === "incoming" && load.status === "planned") {
    if (!load.driverId || !load.vehicleId) {
      return (
        <span className="inline-flex w-full justify-center rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center text-[10px] font-semibold text-amber-800">
          Assign driver + vehicle first
        </span>
      );
    }

    return (
      <form action={markLoadArrivedAction}>
        <input type="hidden" name="loadId" value={load.id} />
        <input type="hidden" name="returnDate" value={returnDate} />
        <button className="w-full rounded-lg bg-orange-500 px-3.5 py-2 text-xs font-bold text-black hover:bg-orange-400">
          Accept / mark arrived
        </button>
      </form>
    );
  }`;

      text = replaceOnce(
        text,
        oldPlanned,
        newPlanned,
        `${rel}: planned primary action`,
      );

      if (!text.includes(`Accept / mark arrived`)) {
        throw new Error(`${rel}: combined primary action label missing.`);
      }

      text = addSentinel(text);
    }

    targets.set(rel, text);
  }
} catch (error) {
  die(error instanceof Error ? error.message : String(error));
}

// No writes happened before this point.
console.log("\nPreflight passed for every target. Writing files...");

for (const [rel, text] of targets) {
  fs.writeFileSync(path.join(ROOT, rel), text, "utf8");
  console.log(`✓ ${rel}`);
}

console.log(`
DONE — Daily Operations Fast Flow v1 applied.

Normal incoming path:
  Planned
    -> Accept / mark arrived
    -> Accepted
    -> Weight
    -> Complete

Exception behavior retained:
  - Permit mismatch records factual arrival and leaves status = arrived.
  - Existing/legacy arrived loads can still use the existing Accept action.
  - Arrived loads can still be rejected.

Transport editor:
  - now renders in a document.body portal
  - fixed full-screen overlay
  - cannot be clipped by worksheet table/card overflow
  - Escape/backdrop closes it

No database migration is required.

Next:
  npm run build
  node scripts/verify-worksheet-fast-flow-v1.cjs
  git diff --check
`);
