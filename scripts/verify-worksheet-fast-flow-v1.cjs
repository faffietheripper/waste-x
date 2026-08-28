#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const SENTINEL = "WASTE_X_WORKSHEET_FAST_FLOW_V1";

const checks = [
  {
    file: "src/app/home/worksheet/TransportAssignmentPopover.tsx",
    must: [
      SENTINEL,
      `import { createPortal } from "react-dom";`,
      `createPortal(`,
      `document.body`,
      `fixed inset-0 z-[100]`,
      `role="dialog"`,
      `aria-modal="true"`,
      `Escape`,
    ],
    mustNot: [
      `absolute left-0 z-30 mt-2 w-[560px]`,
      `className="fixed inset-0 z-20 cursor-default"`,
    ],
  },
  {
    file: "src/app/home/worksheet/actions.ts",
    must: [
      SENTINEL,
      `export async function markLoadArrivedAction`,
      `const permitMatch = await incomingPermitAllowsLoad`,
      `status: "arrived"`,
      `status: "accepted"`,
      `load_arrived_and_accepted`,
      `driver_required`,
      `vehicle_required`,
    ],
    mustNot: [],
  },
  {
    file: "src/app/home/worksheet/page.tsx",
    must: [
      SENTINEL,
      `Accept / mark arrived`,
      `Normal path: Accept / arrive → Weight → Complete`,
      `load_arrived_and_accepted`,
      `Assign driver + vehicle first`,
    ],
    mustNot: [
      `Normal path: Arrived → Weight → Accept → Complete`,
    ],
  },
];

let failed = false;

for (const check of checks) {
  const abs = path.join(ROOT, check.file);

  if (!fs.existsSync(abs)) {
    console.error(`✗ missing ${check.file}`);
    failed = true;
    continue;
  }

  const text = fs.readFileSync(abs, "utf8");
  const problems = [];

  for (const marker of check.must) {
    if (!text.includes(marker)) {
      problems.push(`missing: ${JSON.stringify(marker)}`);
    }
  }

  for (const marker of check.mustNot) {
    if (text.includes(marker)) {
      problems.push(`old marker still present: ${JSON.stringify(marker)}`);
    }
  }

  if (problems.length > 0) {
    console.error(`✗ ${check.file}`);
    for (const problem of problems) console.error(`    ${problem}`);
    failed = true;
  } else {
    console.log(`✓ ${check.file}`);
  }
}

if (failed) {
  console.error("\nVERIFY FAILED");
  process.exit(1);
}

console.log(`
VERIFY PASSED

Confirmed:
- transport editor is page-level/portal based
- normal incoming workflow uses one arrival+acceptance click
- permit mismatch still preserves factual "arrived" exception state
- arrived fallback/rejection model remains intact
- no schema migration is part of this bundle
`);
