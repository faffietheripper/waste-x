#!/usr/bin/env node
"use strict";

/* WASTE_X_OWN_CARRIER_DRIVER_DWT_V1 verifier */

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();

const checks = [
  [
    "src/db/schema.ts",
    [
      "ownCarrierRegistrationNumber",
      "ownCarrierReasonForNoRegistrationNumber",
      "ownCarrierMeansOfTransport",
    ],
  ],
  [
    "src/modules/digital-waste-tracking/data-access/prepareJobLoadWasteReceipt.ts",
    [
      "settings?.ownCarrierRegistrationNumber",
      "settings?.ownCarrierReasonForNoRegistrationNumber",
      "settings?.ownCarrierMeansOfTransport",
    ],
  ],
  [
    "src/modules/digital-waste-tracking/data-access/saveOwnCarrierDwtSettings.ts",
    [
      "WASTE_X_OWN_CARRIER_DRIVER_DWT_V1",
      "saveOwnCarrierDwtSettings",
      "canManageOwnCarrierDwtSettings",
    ],
  ],
  [
    "src/modules/digital-waste-tracking/components/OwnCarrierDwtFields.tsx",
    [
      "WASTE_X_OWN_CARRIER_DRIVER_DWT_V1",
      "ownCarrierRegistrationNumber",
      "ownCarrierReasonForNoRegistrationNumber",
      "Householder transporting own waste",
    ],
  ],
  [
    "src/app/home/transport/actions.ts",
    [
      "WASTE_X_OWN_CARRIER_DRIVER_DWT_V1",
      "saveOwnCarrierDwtFromDriverForm",
      "ownCarrierDwtPresent",
    ],
  ],
  [
    "src/app/home/transport/drivers/new/page.tsx",
    [
      "WASTE_X_OWN_CARRIER_DRIVER_DWT_V1",
      "OwnCarrierDwtFields",
      "Own Carrier DWT",
    ],
  ],
  [
    "src/app/home/transport/drivers/[driverId]/page.tsx",
    [
      "WASTE_X_OWN_CARRIER_DRIVER_DWT_V1",
      "OwnCarrierDwtFields",
      "Organisation carrier identity",
    ],
  ],
  [
    "src/app/home/jobs/new/lib/types.ts",
    [
      "WASTE_X_OWN_CARRIER_DRIVER_DWT_V1",
      "BookJobOwnCarrierDwt",
      "ownCarrierDwt: BookJobOwnCarrierDwt",
    ],
  ],
  [
    "src/app/home/jobs/new/page.tsx",
    [
      "WASTE_X_OWN_CARRIER_DRIVER_DWT_V1",
      "getWasteTrackingOrganisationSettings",
      "ownCarrierDwt:",
    ],
  ],
  [
    "src/app/home/jobs/new/quick-create-actions.ts",
    [
      "WASTE_X_OWN_CARRIER_DRIVER_DWT_V1",
      "saveOwnCarrierDwtSettings",
      "ownCarrierDwtPresent",
      "driver: created",
    ],
  ],
  [
    "src/app/home/jobs/new/components/BookJobForm.tsx",
    [
      "WASTE_X_OWN_CARRIER_DRIVER_DWT_V1",
      "OwnCarrierDwtFields",
      "setOwnCarrierDwt",
      "ownCarrierDwt={ownCarrierDwt}",
    ],
  ],
  [
    "src/modules/digital-waste-tracking/core/getJobLoadReceiveMovementDraft.ts",
    [
      "WASTE_X_OWN_CARRIER_DRIVER_DWT_V1",
      "useCurrentOwnCarrierDefaults",
      "resolvedCarrierRegistration",
      "resolvedCarrierReason",
    ],
  ],
  [
    "src/modules/digital-waste-tracking/actions/submitJobLoadReceiveMovementAction.ts",
    [
      "WASTE_X_OWN_CARRIER_DRIVER_DWT_V1",
      "carrierRegistrationNumber:",
      "carrierReasonForNoRegistrationNumber:",
      "carrierMeansOfTransport:",
    ],
  ],
  [
    "src/app/home/settings/digital-waste-tracking/OwnCarrierDwtSettingsForm.tsx",
    [
      "WASTE_X_OWN_CARRIER_DRIVER_DWT_V1",
      "Movement within the same premises",
      "Householder transporting own waste",
    ],
  ],
  [
    "src/app/home/dwt/intake/[jobLoadId]/JobLoadReceiveMovementForm.tsx",
    [
      "WASTE_X_OWN_CARRIER_DRIVER_DWT_V1",
      "Householder transporting own waste",
    ],
  ],
  [
    "src/app/home/dwt/batch/fix/[jobLoadId]/page.tsx",
    [
      "WASTE_X_OWN_CARRIER_DRIVER_DWT_V1",
      "Householder transporting own waste",
    ],
  ],
];

let failed = false;

for (const [relPath, markers] of checks) {
  const file = path.join(ROOT, relPath);

  if (!fs.existsSync(file)) {
    console.error(`✗ ${relPath} — file missing`);
    failed = true;
    continue;
  }

  const text = fs.readFileSync(file, "utf8");
  const missing = markers.filter((marker) => !text.includes(marker));

  if (missing.length) {
    console.error(`✗ ${relPath} — missing: ${missing.join(", ")}`);
    failed = true;
  } else {
    console.log(`✓ ${relPath}`);
  }
}

if (failed) {
  console.error("\nOwn-carrier / driver / DWT integration verification FAILED.");
  process.exit(1);
}

console.log(`
Own-carrier / driver / DWT integration markers are present.

Recommended final checks:
  npm run build
  git diff --check
  git diff

No database migration is required by this integration.
`);
