/*
  Waste X auto-geography + receiving-site consistency patch.

  Run from the repository root:

    node scripts/apply-auto-geography-v1.cjs

  The script is intentionally defensive:
  - it only patches known current-repo sections;
  - it refuses to silently continue if an expected marker is missing;
  - it is idempotent for the imports/calls that it adds.

  New source files from this bundle must be copied into the repository before
  running this script:
    src/modules/quarterly-returns/site-geography.ts
    src/modules/quarterly-returns/snapshot.ts
*/

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();

function read(rel) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) {
    throw new Error(`Missing expected repo file: ${rel}`);
  }
  return fs.readFileSync(file, "utf8");
}

function write(rel, content) {
  fs.writeFileSync(path.join(ROOT, rel), content);
  console.log(`✓ patched ${rel}`);
}

function insertImportAfterSchema(rel, importLine) {
  let text = read(rel);
  if (text.includes(importLine)) return text;

  const marker = `} from "@/db/schema";`;
  const index = text.indexOf(marker);
  if (index === -1) {
    throw new Error(`${rel}: could not find @/db/schema import marker`);
  }

  const end = index + marker.length;
  text =
    text.slice(0, end) +
    `\n${importLine}` +
    text.slice(end);

  return text;
}

function section(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  if (start === -1) {
    throw new Error(`Missing section start: ${startMarker}`);
  }

  const end = text.indexOf(endMarker, start + startMarker.length);
  if (end === -1) {
    throw new Error(`Missing section end: ${endMarker}`);
  }

  return {
    before: text.slice(0, start),
    body: text.slice(start, end),
    after: text.slice(end),
  };
}

function patchSection(text, startMarker, endMarker, patcher) {
  const parts = section(text, startMarker, endMarker);
  return parts.before + patcher(parts.body) + parts.after;
}

function insertBeforeOnce(text, marker, addition, label) {
  if (text.includes(addition.trim())) return text;

  const index = text.indexOf(marker);
  if (index === -1) {
    throw new Error(`Could not patch ${label}; marker missing: ${marker}`);
  }

  return text.slice(0, index) + addition + text.slice(index);
}

function replaceOnce(text, oldValue, newValue, label) {
  if (text.includes(newValue)) return text;

  const index = text.indexOf(oldValue);
  if (index === -1) {
    throw new Error(`Could not patch ${label}; expected block not found`);
  }

  return (
    text.slice(0, index) +
    newValue +
    text.slice(index + oldValue.length)
  );
}

const geographyImport =
  `import { resolveSiteReturnGeographyBestEffort } from "@/modules/quarterly-returns/site-geography";`;

/* =====================================================================
   RECEIVING SITE
===================================================================== */
{
  const rel = "src/app/home/sites/actions.ts";
  let text = insertImportAfterSchema(rel, geographyImport);

  text = patchSection(
    text,
    "export async function createReceivingSiteAction(",
    "/* =========================================================\n   UPDATE RECEIVING SITE",
    (body) =>
      insertBeforeOnce(
        body,
        `  revalidatePath("/home/sites");`,
        `
  await resolveSiteReturnGeographyBestEffort({
    organisationId: context.organisationId,
    userId: context.userId,
    subjectType: "own_site",
    subjectId: createdSite.id,
    postcode,
  });

  revalidatePath("/home/returns");

`,
        "create receiving-site auto geography",
      ),
  );

  text = patchSection(
    text,
    "export async function updateReceivingSiteAction(",
    "/* =========================================================\n   CREATE PRIMARY PERMIT",
    (body) =>
      insertBeforeOnce(
        body,
        `  revalidatePath("/home/sites");`,
        `
  await resolveSiteReturnGeographyBestEffort({
    organisationId: context.organisationId,
    userId: context.userId,
    subjectType: "own_site",
    subjectId: siteId,
    postcode,
  });

  revalidatePath("/home/returns");

`,
        "update receiving-site auto geography",
      ),
  );

  text = patchSection(
    text,
    "export async function createSitePermitAction(",
    "/* =========================================================\n   UPDATE PRIMARY PERMIT",
    (body) => {
      let next = body;

      next = replaceOnce(
        next,
        `        .set({
          permitNumber,
          updatedAt: new Date(),
        })`,
        `        .set({
          permitNumber,

          /*
            Creating the active primary permit from the Receiving Site & Permit
            surface also promotes a legacy default "main_site" into the explicit
            receiving-site type used by Returns.
          */
          siteType: "waste_receiving_site",
          isDefault: true,
          status: "active",

          updatedAt: new Date(),
        })`,
        "promote legacy main site when permit is created",
      );

      next = insertBeforeOnce(
        next,
        `  revalidatePath(
    \`/home/sites/\${siteId}\`,
  );`,
        `
  const savedPermitSite =
    await database.query.sites.findFirst({
      where: and(
        eq(sites.id, siteId),
        eq(sites.organisationId, context.organisationId),
      ),
      columns: {
        postcode: true,
      },
    });

  if (savedPermitSite) {
    await resolveSiteReturnGeographyBestEffort({
      organisationId: context.organisationId,
      userId: context.userId,
      subjectType: "own_site",
      subjectId: siteId,
      postcode: savedPermitSite.postcode,
    });
  }

  revalidatePath("/home/returns");

`,
        "permit receiving-site geography",
      );

      return next;
    },
  );

  write(rel, text);
}

/* =====================================================================
   RECEIVING-SITE PAGE CONSISTENCY
===================================================================== */
{
  const rel = "src/app/home/sites/page.tsx";
  let text = read(rel);

  const oldSelection = `  const receivingSite =
    organisationSites.find(
      (site) => site.isDefault,
    ) ??
    organisationSites[0] ??
    null;`;

  const newSelection = `  const receivingSite =
    organisationSites.find(
      (site) =>
        site.siteType === "waste_receiving_site" &&
        site.isDefault,
    ) ??
    organisationSites.find(
      (site) =>
        site.siteType === "waste_receiving_site",
    ) ??
    organisationSites.find(
      (site) => site.isDefault,
    ) ??
    organisationSites[0] ??
    null;`;

  text = replaceOnce(
    text,
    oldSelection,
    newSelection,
    "receiving-site page selection",
  );

  const oldType = `                <MiniDetail
                  label="Site type"
                  value="Waste receiving site"
                />`;

  const newType = `                <MiniDetail
                  label="Site type"
                  value={
                    receivingSite.siteType === "waste_receiving_site"
                      ? "Waste receiving site"
                      : "Primary site · legacy type"
                  }
                />`;

  text = replaceOnce(
    text,
    oldType,
    newType,
    "truthful receiving-site type display",
  );

  write(rel, text);
}

/* =====================================================================
   CLIENT SITES
===================================================================== */
{
  const rel = "src/app/home/clients/actions.ts";
  let text = insertImportAfterSchema(rel, geographyImport);

  text = patchSection(
    text,
    "export async function createClientSiteAction(",
    "/* =========================================================\n   UPDATE CLIENT SITE",
    (body) =>
      insertBeforeOnce(
        body,
        `  revalidatePath(
    "/home/clients",
  );`,
        `
  const createdSite =
    await database.query.counterpartySites.findFirst({
      where: and(
        eq(
          counterpartySites.organisationId,
          context.organisationId,
        ),
        eq(
          counterpartySites.counterpartyId,
          clientId,
        ),
        eq(
          counterpartySites.name,
          name,
        ),
      ),
      columns: {
        id: true,
      },
    });

  if (createdSite) {
    await resolveSiteReturnGeographyBestEffort({
      organisationId: context.organisationId,
      userId: context.userId,
      subjectType: "counterparty_site",
      subjectId: createdSite.id,
      postcode,
    });
  }

  revalidatePath("/home/returns");

`,
        "create client-site auto geography",
      ),
  );

  text = patchSection(
    text,
    "export async function updateClientSiteAction(",
    "/* =========================================================\n   SET DEFAULT CLIENT SITE",
    (body) =>
      insertBeforeOnce(
        body,
        `  revalidatePath(
    \`/home/clients/\${clientId}\`,
  );`,
        `
  await resolveSiteReturnGeographyBestEffort({
    organisationId: context.organisationId,
    userId: context.userId,
    subjectType: "counterparty_site",
    subjectId: siteId,
    postcode,
  });

  revalidatePath("/home/returns");

`,
        "update client-site auto geography",
      ),
  );

  write(rel, text);
}

/* =====================================================================
   THIRD-PARTY FACILITIES
===================================================================== */
{
  const rel = "src/app/home/tips/actions.ts";
  let text = insertImportAfterSchema(rel, geographyImport);

  text = patchSection(
    text,
    "export async function createExternalFacilityAction(",
    "export async function updateExternalFacilityAction(",
    (body) =>
      insertBeforeOnce(
        body,
        `  revalidatePath("/home/tips");`,
        `
  await resolveSiteReturnGeographyBestEffort({
    organisationId: context.organisationId,
    userId: context.userId,
    subjectType: "counterparty_site",
    subjectId: facilityId,
    postcode: facilityPostcode,
  });

  revalidatePath("/home/returns");

`,
        "create third-party facility auto geography",
      ),
  );

  text = patchSection(
    text,
    "export async function updateExternalFacilityAction(",
    "export async function updateExternalFacilityAuthorisationAction(",
    (body) =>
      insertBeforeOnce(
        body,
        `  revalidatePath("/home/tips");`,
        `
  await resolveSiteReturnGeographyBestEffort({
    organisationId: context.organisationId,
    userId: context.userId,
    subjectType: "counterparty_site",
    subjectId: facilityId,
    postcode: postcode(formData.get("postcode")),
  });

  revalidatePath("/home/returns");

`,
        "update third-party facility auto geography",
      ),
  );

  write(rel, text);
}

/* =====================================================================
   JOB QUICK-CREATE CLIENT/SITE PATHS
===================================================================== */
{
  const rel = "src/app/home/jobs/new/quick-create-actions.ts";
  let text = insertImportAfterSchema(rel, geographyImport);

  text = patchSection(
    text,
    "export async function quickCreateClientAction(",
    "export async function quickCreateClientSiteAction(",
    (body) => {
      let next = replaceOnce(
        body,
        `  const { organisationId } = contextResult.data;`,
        `  const { organisationId, userId } = contextResult.data;`,
        "quick-create client context",
      );

      next = insertBeforeOnce(
        next,
        `  revalidatePath("/home/clients");`,
        `
  if (created.site) {
    await resolveSiteReturnGeographyBestEffort({
      organisationId,
      userId,
      subjectType: "counterparty_site",
      subjectId: created.site.id,
      postcode: created.site.postcode,
    });
  }

  revalidatePath("/home/returns");

`,
        "quick-create client/site geography",
      );

      return next;
    },
  );

  text = patchSection(
    text,
    "export async function quickCreateClientSiteAction(",
    "export async function quickCreateHaulierAction(",
    (body) => {
      let next = replaceOnce(
        body,
        `  const { organisationId } = contextResult.data;`,
        `  const { organisationId, userId } = contextResult.data;`,
        "quick-create client-site context",
      );

      next = insertBeforeOnce(
        next,
        `  revalidatePath(\`/home/clients/\${clientId}\`);`,
        `
  await resolveSiteReturnGeographyBestEffort({
    organisationId,
    userId,
    subjectType: "counterparty_site",
    subjectId: created.id,
    postcode: created.postcode,
  });

  revalidatePath("/home/returns");

`,
        "quick-create client-site geography",
      );

      return next;
    },
  );

  write(rel, text);
}

/* =====================================================================
   RETURNS: USE THE SAME PRIMARY RECEIVING-SITE REALITY AS THE WORKSPACE
===================================================================== */
{
  const rel =
    "src/modules/admin-value/data-access/getQuarterlyWasteReturnData.ts";
  let text = read(rel);

  const startMarker =
    `  const ownSites = await database.query.sites.findMany({`;
  const endMarker =
    `  const siteOptions: WasteReturnSiteOption[] = ownSites`;

  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start);

  if (start === -1 || end === -1) {
    throw new Error(
      `${rel}: could not find receiving-site query block`,
    );
  }

  const replacement = `  /*
    Prefer explicit current-model receiving sites.

    Compatibility rule:
    older Solo organisations may still have their configured destination stored
    as a default "main_site". The Receiving Site & Permit UI historically treated
    that row as the receiving site, while Quarterly Returns filtered it out.
    Until those rows are repaired, use the same physical-site reality here.
  */
  const activeOwnSites =
    await database.query.sites.findMany({
      where: and(
        eq(
          sites.organisationId,
          params.organisationId,
        ),
        eq(
          sites.status,
          "active",
        ),
      ),
      with: {
        permits: true,
      },
    });

  const explicitReceivingSites =
    activeOwnSites.filter(
      (site) =>
        site.siteType ===
        "waste_receiving_site",
    );

  const defaultLegacySites =
    activeOwnSites.filter(
      (site) => site.isDefault,
    );

  const permittedLegacySites =
    activeOwnSites.filter(
      (site) =>
        site.permits.some(
          (permit) =>
            permit.status === "active",
        ),
    );

  const ownSites =
    explicitReceivingSites.length > 0
      ? explicitReceivingSites
      : defaultLegacySites.length > 0
        ? defaultLegacySites
        : permittedLegacySites.length > 0
          ? permittedLegacySites
          : activeOwnSites.slice(0, 1);

`;

  text =
    text.slice(0, start) +
    replacement +
    text.slice(end);

  write(rel, text);
}

/* =====================================================================
   RETURNS BULK/SINGLE LOOKUP: DO NOT SILENTLY DESTROY MANUAL OVERRIDES
===================================================================== */
{
  const rel = "src/app/home/returns/actions.ts";
  let text = read(rel);

  text = patchSection(
    text,
    "async function upsertResolvedGeography(",
    "export async function resolveSingleReturnGeographyAction(",
    (body) => {
      if (body.includes(`existing?.source === "manual"`)) return body;

      const marker = `  const resolved = await resolvePostcodes([params.postcode]);`;

      return insertBeforeOnce(
        body,
        marker,
        `
  const existing =
    await database.query.returnSiteGeographies.findFirst({
      where: and(
        eq(
          returnSiteGeographies.organisationId,
          params.organisationId,
        ),
        eq(
          returnSiteGeographies.subjectType,
          params.subjectType,
        ),
        eq(
          returnSiteGeographies.subjectId,
          params.subjectId,
        ),
      ),
    });

  /*
    Manual means the operator deliberately overrode automatic postcode
    geography. A later "Try postcode lookup" must not silently erase it.
  */
  if (existing?.source === "manual") {
    return true;
  }

`,
        "preserve manual geography in single resolver",
      );
    },
  );

  text = patchSection(
    text,
    "export async function resolveReturnGeographiesAction(",
    "export async function backfillQuarterReturnSnapshotsAction(",
    (body) => {
      let next = body;

      if (!next.includes("manualGeographyKeys")) {
        next = insertBeforeOnce(
          next,
          `  let resolvedCount = 0;`,
          `
  const manualGeographies =
    await database
      .select({
        subjectType:
          returnSiteGeographies.subjectType,
        subjectId:
          returnSiteGeographies.subjectId,
      })
      .from(returnSiteGeographies)
      .where(
        and(
          eq(
            returnSiteGeographies.organisationId,
            access.organisationId,
          ),
          eq(
            returnSiteGeographies.source,
            "manual",
          ),
        ),
      );

  const manualGeographyKeys =
    new Set(
      manualGeographies.map(
        (row) =>
          \`\${row.subjectType}:\${row.subjectId}\`,
      ),
    );

`,
          "load manual geography keys before bulk resolver",
        );

        next = replaceOnce(
          next,
          `  for (const subject of withPostcodes) {
    const match = resolved.get(subject.postcode);`,
          `  for (const subject of withPostcodes) {
    if (
      manualGeographyKeys.has(
        \`\${subject.subjectType}:\${subject.subjectId}\`,
      )
    ) {
      continue;
    }

    const match = resolved.get(subject.postcode);`,
          "skip manual mappings in bulk resolver",
        );
      }

      return next;
    },
  );

  write(rel, text);
}

console.log("");
console.log("Waste X auto-geography patch applied.");
console.log("Next:");
console.log("  1. npm run build");
console.log("  2. run the existing-data backfill script against Demo first");
console.log("  3. deploy and retest /home/sites + /home/returns");
