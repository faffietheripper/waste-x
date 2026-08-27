/*
  Waste X — one-time/current-data geography catch-up.

  Run from repo root with DATABASE_URL pointing at the target database:

    DATABASE_URL="..." node scripts/backfill-existing-site-geography.cjs

  Recommended order:
    1. Demo
    2. verify UI
    3. Main

  What this does:
    - promotes a legacy default active Site with an active permit to the explicit
      waste_receiving_site type when the organisation has no explicit receiving
      site yet;
    - resolves existing own-site + counterparty-site postcodes via Postcodes.io;
    - persists return geography;
    - NEVER overwrites source='manual' geography;
    - fills null Origin/Destination geography on existing Load return snapshots;
    - does not delete Jobs, Loads, permits, invoices, DWT records or tickets.

  Requires Node 18+ (global fetch), pg and dotenv — already used by Waste X.
*/

const crypto = require("crypto");
const path = require("path");
const { Client } = require("pg");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config({
  path: path.join(process.cwd(), ".env"),
  override: false,
});

const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;

if (!connectionString) {
  console.error(
    "Missing DATABASE_URL / POSTGRES_URL.",
  );
  process.exit(1);
}

function normaliseUkPostcode(value) {
  const compact = String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();

  if (
    compact.length < 5 ||
    compact.length > 7
  ) {
    return "";
  }

  return `${compact.slice(
    0,
    -3,
  )} ${compact.slice(-3)}`;
}

async function resolvePostcodes(postcodes) {
  const unique = Array.from(
    new Set(
      postcodes
        .map(normaliseUkPostcode)
        .filter(Boolean),
    ),
  );

  const output = new Map();

  for (
    let index = 0;
    index < unique.length;
    index += 100
  ) {
    const batch =
      unique.slice(index, index + 100);

    const response = await fetch(
      "https://api.postcodes.io/postcodes",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          postcodes: batch,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(
        `POSTCODE_LOOKUP_FAILED_${response.status}`,
      );
    }

    const body = await response.json();

    for (const item of body.result ?? []) {
      const query =
        normaliseUkPostcode(item.query);

      const result = item.result;

      if (
        !query ||
        !result?.admin_district ||
        !result?.codes?.admin_district
      ) {
        continue;
      }

      output.set(query, {
        postcode:
          normaliseUkPostcode(
            result.postcode,
          ) || query,
        localAuthorityCode:
          result.codes.admin_district,
        localAuthorityName:
          result.admin_district,
        returnAreaLabel:
          result.admin_district,
      });
    }
  }

  return output;
}

async function main() {
  const client =
    new Client({ connectionString });

  await client.connect();

  try {
    console.log(
      "Waste X existing-site geography catch-up",
    );

    /*
      Fix the exact legacy mismatch exposed by the screenshots:
      /home/sites historically accepted the default active site as the receiving
      destination, while /home/returns required siteType=waste_receiving_site.
    */
    const repaired =
      await client.query(`
        UPDATE "bb_sites" s
        SET
          "siteType" = 'waste_receiving_site',
          "updatedAt" = NOW()
        WHERE
          s."status" = 'active'
          AND s."isDefault" = TRUE
          AND EXISTS (
            SELECT 1
            FROM "bb_site_permit" p
            WHERE
              p."siteId" = s."id"
              AND p."organisationId" = s."organisationId"
              AND p."status" = 'active'
          )
          AND NOT EXISTS (
            SELECT 1
            FROM "bb_sites" explicit_site
            WHERE
              explicit_site."organisationId" = s."organisationId"
              AND explicit_site."status" = 'active'
              AND explicit_site."siteType" = 'waste_receiving_site'
          )
        RETURNING
          s."id",
          s."organisationId",
          s."name";
      `);

    console.log(
      `Receiving-site rows repaired: ${repaired.rowCount}`,
    );

    const ownSites =
      await client.query(`
        SELECT
          "id",
          "organisationId",
          "name",
          "postcode"
        FROM "bb_sites"
        WHERE
          "status" = 'active'
          AND COALESCE(TRIM("postcode"), '') <> '';
      `);

    const counterpartySites =
      await client.query(`
        SELECT
          "id",
          "organisationId",
          "name",
          "postcode"
        FROM "bb_counterparty_site"
        WHERE
          "isActive" = TRUE
          AND COALESCE(TRIM("postcode"), '') <> '';
      `);

    const subjects = [
      ...ownSites.rows.map((row) => ({
        subjectType: "own_site",
        subjectId: row.id,
        organisationId:
          row.organisationId,
        name: row.name,
        postcode:
          normaliseUkPostcode(
            row.postcode,
          ),
      })),
      ...counterpartySites.rows.map(
        (row) => ({
          subjectType:
            "counterparty_site",
          subjectId: row.id,
          organisationId:
            row.organisationId,
          name: row.name,
          postcode:
            normaliseUkPostcode(
              row.postcode,
            ),
        }),
      ),
    ].filter(
      (subject) => subject.postcode,
    );

    console.log(
      `Physical sites with usable postcodes: ${subjects.length}`,
    );

    const resolved =
      await resolvePostcodes(
        subjects.map(
          (subject) =>
            subject.postcode,
        ),
      );

    let resolvedCount = 0;
    let unresolvedCount = 0;
    let manualPreserved = 0;

    for (const subject of subjects) {
      const match =
        resolved.get(subject.postcode);

      const existing =
        await client.query(
          `
            SELECT "source"
            FROM "bb_return_site_geography"
            WHERE
              "organisationId" = $1
              AND "subjectType" = $2
              AND "subjectId" = $3
            LIMIT 1;
          `,
          [
            subject.organisationId,
            subject.subjectType,
            subject.subjectId,
          ],
        );

      if (
        existing.rows[0]?.source ===
        "manual"
      ) {
        manualPreserved += 1;
        continue;
      }

      if (!match) {
        unresolvedCount += 1;

        await client.query(
          `
            INSERT INTO "bb_return_site_geography" (
              "id",
              "organisationId",
              "subjectType",
              "subjectId",
              "postcodeSnapshot",
              "localAuthorityCode",
              "localAuthorityName",
              "returnAreaLabel",
              "source",
              "resolvedAt",
              "updatedByUserId",
              "createdAt",
              "updatedAt"
            )
            VALUES (
              $1, $2, $3, $4, $5,
              NULL, NULL, NULL,
              'postcodes_io',
              NULL,
              NULL,
              NOW(),
              NOW()
            )
            ON CONFLICT (
              "organisationId",
              "subjectType",
              "subjectId"
            )
            DO UPDATE SET
              "postcodeSnapshot" =
                EXCLUDED."postcodeSnapshot",
              "localAuthorityCode" = NULL,
              "localAuthorityName" = NULL,
              "returnAreaLabel" = NULL,
              "source" = 'postcodes_io',
              "resolvedAt" = NULL,
              "updatedAt" = NOW()
            WHERE
              "bb_return_site_geography"."source"
              <> 'manual';
          `,
          [
            crypto.randomUUID(),
            subject.organisationId,
            subject.subjectType,
            subject.subjectId,
            subject.postcode,
          ],
        );

        continue;
      }

      await client.query(
        `
          INSERT INTO "bb_return_site_geography" (
            "id",
            "organisationId",
            "subjectType",
            "subjectId",
            "postcodeSnapshot",
            "localAuthorityCode",
            "localAuthorityName",
            "returnAreaLabel",
            "source",
            "resolvedAt",
            "updatedByUserId",
            "createdAt",
            "updatedAt"
          )
          VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8,
            'postcodes_io',
            NOW(),
            NULL,
            NOW(),
            NOW()
          )
          ON CONFLICT (
            "organisationId",
            "subjectType",
            "subjectId"
          )
          DO UPDATE SET
            "postcodeSnapshot" =
              EXCLUDED."postcodeSnapshot",
            "localAuthorityCode" =
              EXCLUDED."localAuthorityCode",
            "localAuthorityName" =
              EXCLUDED."localAuthorityName",
            "returnAreaLabel" =
              EXCLUDED."returnAreaLabel",
            "source" = 'postcodes_io',
            "resolvedAt" = NOW(),
            "updatedAt" = NOW()
          WHERE
            "bb_return_site_geography"."source"
            <> 'manual';
        `,
        [
          crypto.randomUUID(),
          subject.organisationId,
          subject.subjectType,
          subject.subjectId,
          match.postcode,
          match.localAuthorityCode,
          match.localAuthorityName,
          match.returnAreaLabel,
        ],
      );

      resolvedCount += 1;
    }

    /*
      Existing snapshot enrichment.
      Non-null historical values win via COALESCE(snapshot, resolved).
    */
    const originEnrichment =
      await client.query(`
        UPDATE "bb_job_load_return_snapshot" snapshot
        SET
          "originLocalAuthorityCode" =
            COALESCE(
              snapshot."originLocalAuthorityCode",
              geography."localAuthorityCode"
            ),
          "originLocalAuthorityName" =
            COALESCE(
              snapshot."originLocalAuthorityName",
              geography."localAuthorityName"
            ),
          "originReturnAreaLabel" =
            COALESCE(
              snapshot."originReturnAreaLabel",
              geography."returnAreaLabel",
              geography."localAuthorityName"
            ),
          "originPostcodeSnapshot" =
            COALESCE(
              snapshot."originPostcodeSnapshot",
              geography."postcodeSnapshot",
              source_site."postcode"
            ),
          "updatedAt" = NOW()
        FROM
          "bb_job_load" load
          JOIN "bb_counterparty_site" source_site
            ON source_site."id" = load."clientSiteId"
          JOIN "bb_return_site_geography" geography
            ON geography."organisationId" =
               load."organisationId"
            AND geography."subjectType" =
                'counterparty_site'
            AND geography."subjectId" =
                source_site."id"
        WHERE
          snapshot."jobLoadId" = load."id"
          AND load."direction" = 'incoming'
          AND (
            snapshot."originLocalAuthorityCode" IS NULL
            OR snapshot."originLocalAuthorityName" IS NULL
            OR snapshot."originReturnAreaLabel" IS NULL
            OR snapshot."originPostcodeSnapshot" IS NULL
          );
      `);

    const destinationEnrichment =
      await client.query(`
        UPDATE "bb_job_load_return_snapshot" snapshot
        SET
          "destinationLocalAuthorityCode" =
            COALESCE(
              snapshot."destinationLocalAuthorityCode",
              geography."localAuthorityCode"
            ),
          "destinationLocalAuthorityName" =
            COALESCE(
              snapshot."destinationLocalAuthorityName",
              geography."localAuthorityName"
            ),
          "destinationReturnAreaLabel" =
            COALESCE(
              snapshot."destinationReturnAreaLabel",
              geography."returnAreaLabel",
              geography."localAuthorityName"
            ),
          "destinationPostcodeSnapshot" =
            COALESCE(
              snapshot."destinationPostcodeSnapshot",
              geography."postcodeSnapshot",
              destination_site."postcode"
            ),
          "updatedAt" = NOW()
        FROM
          "bb_job_load" load
          JOIN "bb_counterparty_site" destination_site
            ON destination_site."id" =
               load."thirdPartyDestinationSiteId"
          JOIN "bb_return_site_geography" geography
            ON geography."organisationId" =
               load."organisationId"
            AND geography."subjectType" =
                'counterparty_site'
            AND geography."subjectId" =
                destination_site."id"
        WHERE
          snapshot."jobLoadId" = load."id"
          AND load."direction" = 'outgoing'
          AND (
            snapshot."destinationLocalAuthorityCode" IS NULL
            OR snapshot."destinationLocalAuthorityName" IS NULL
            OR snapshot."destinationReturnAreaLabel" IS NULL
            OR snapshot."destinationPostcodeSnapshot" IS NULL
          );
      `);

    console.log("");
    console.log("Catch-up complete");
    console.log(
      `  Resolved site geographies: ${resolvedCount}`,
    );
    console.log(
      `  Unresolved postcodes:       ${unresolvedCount}`,
    );
    console.log(
      `  Manual overrides preserved: ${manualPreserved}`,
    );
    console.log(
      `  Origin snapshots enriched:  ${originEnrichment.rowCount}`,
    );
    console.log(
      `  Destination snapshots:      ${destinationEnrichment.rowCount}`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(
    "Waste X geography catch-up failed:",
  );
  console.error(error);
  process.exit(1);
});
