const fs = require("fs");
const path = require("path");

const root = process.cwd();

const checks = [
  {
    file: "src/app/home/jobs/new/components/BookJobForm.tsx",
    needles: [
      "This Job is the pricing authority",
      "customerChargeAmount",
      "Use available suggestions",
    ],
  },
  {
    file: "src/app/home/jobs/new/actions.ts",
    needles: [
      "parseIncomingBookingPricing",
      "jobCommercialLines",
      "bookingCommercialLines(pricing)",
    ],
  },
  {
    file: "src/app/home/movements/outgoing/new/_components/OutgoingBookingForm.tsx",
    needles: [
      "Job-specific",
      "materialSaleAmount",
      "tippingCostAmount",
    ],
  },
  {
    file: "src/app/home/movements/outgoing/new/actions.ts",
    needles: [
      "parseOutgoingBookingPricing",
      "jobCommercialLines",
      "customerChargeAmount: pricing.primaryRevenue?.amount",
    ],
  },
  {
    file: "src/app/home/commercial/actions.ts",
    needles: [
      'job.direction === "outgoing"',
      '"material_sale"',
    ],
  },
  {
    file: "src/modules/admin-value/data-access/getCommercialAdminData.ts",
    needles: [
      "jobCommercialLines",
      'pricingSource: "job_specific"',
      "calculateCurrentJobCommercials",
    ],
  },
  {
    file: "src/app/home/jobs/[jobId]/page.tsx",
    needles: [
      "Job-specific commercial terms",
      "Set / edit Job pricing",
    ],
  },
];

let failed = false;

for (const check of checks) {
  const full = path.join(root, check.file);

  if (!fs.existsSync(full)) {
    console.error(`✕ missing ${check.file}`);
    failed = true;
    continue;
  }

  const text = fs.readFileSync(full, "utf8");
  const missing = check.needles.filter(
    (needle) => !text.includes(needle),
  );

  if (missing.length > 0) {
    console.error(`✕ ${check.file}`);
    for (const needle of missing) {
      console.error(`    missing: ${needle}`);
    }
    failed = true;
  } else {
    console.log(`✓ ${check.file}`);
  }
}

if (failed) {
  process.exit(1);
}

console.log("");
console.log("Job-specific pricing integration markers are present.");
