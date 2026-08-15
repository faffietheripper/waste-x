// scripts/seed-reference-data.ts

import "dotenv/config";

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

import {
  disposalRecoveryCodes,
  ewcCodes,
} from "../src/db/schema";

import ewcCatalogue from "../src/ewc-codes.json";

/* =========================================================
   TYPES
========================================================= */

type RawEwcCode = {
  code: string;
  isHazardous?: boolean;
  entryTypeDesc?: string | null;
  chapter?: string | null;
  subChapter?: string | null;
  description: string;
};

type DisposalRecoverySeed = {
  code: string;
  type: "disposal" | "recovery";
  description: string;
};

/* =========================================================
   DISPOSAL / RECOVERY CODES
========================================================= */

const disposalRecoverySeed: DisposalRecoverySeed[] = [
  /* =======================================================
     DISPOSAL
  ======================================================= */

  {
    code: "D1",
    type: "disposal",
    description:
      "Deposit into or onto land, for example landfill.",
  },

  {
    code: "D2",
    type: "disposal",
    description:
      "Land treatment, for example biodegradation of liquid or sludgy discards in soils.",
  },

  {
    code: "D3",
    type: "disposal",
    description:
      "Deep injection, for example injection of pumpable discards into wells, salt domes or naturally occurring repositories.",
  },

  {
    code: "D4",
    type: "disposal",
    description:
      "Surface impoundment, for example placement of liquid or sludgy discards into pits, ponds or lagoons.",
  },

  {
    code: "D5",
    type: "disposal",
    description:
      "Specially engineered landfill, for example placement into lined discrete cells which are capped and isolated from one another and the environment.",
  },

  {
    code: "D6",
    type: "disposal",
    description:
      "Release into a water body except seas or oceans.",
  },

  {
    code: "D7",
    type: "disposal",
    description:
      "Release into seas or oceans including sea-bed insertion.",
  },

  {
    code: "D8",
    type: "disposal",
    description:
      "Biological treatment not specified elsewhere which results in final compounds or mixtures discarded by means of operations D1 to D12.",
  },

  {
    code: "D9",
    type: "disposal",
    description:
      "Physico-chemical treatment not specified elsewhere which results in final compounds or mixtures discarded by means of operations D1 to D12.",
  },

  {
    code: "D10",
    type: "disposal",
    description: "Incineration on land.",
  },

  {
    code: "D11",
    type: "disposal",
    description: "Incineration at sea.",
  },

  {
    code: "D12",
    type: "disposal",
    description:
      "Permanent storage, for example emplacement of containers in a mine.",
  },

  {
    code: "D13",
    type: "disposal",
    description:
      "Blending or mixing prior to submission to any of the operations D1 to D12.",
  },

  {
    code: "D14",
    type: "disposal",
    description:
      "Repackaging prior to submission to any of the operations D1 to D13.",
  },

  {
    code: "D15",
    type: "disposal",
    description:
      "Storage pending any of the operations D1 to D14, excluding temporary storage pending collection on the site where the waste is produced.",
  },

  /* =======================================================
     RECOVERY
  ======================================================= */

  {
    code: "R1",
    type: "recovery",
    description:
      "Use principally as a fuel or other means to generate energy.",
  },

  {
    code: "R2",
    type: "recovery",
    description:
      "Solvent reclamation or regeneration.",
  },

  {
    code: "R3",
    type: "recovery",
    description:
      "Recycling or reclamation of organic substances which are not used as solvents, including composting and other biological transformation processes.",
  },

  {
    code: "R4",
    type: "recovery",
    description:
      "Recycling or reclamation of metals and metal compounds.",
  },

  {
    code: "R5",
    type: "recovery",
    description:
      "Recycling or reclamation of other inorganic materials.",
  },

  {
    code: "R6",
    type: "recovery",
    description: "Regeneration of acids or bases.",
  },

  {
    code: "R7",
    type: "recovery",
    description:
      "Recovery of components used for pollution abatement.",
  },

  {
    code: "R8",
    type: "recovery",
    description:
      "Recovery of components from catalysts.",
  },

  {
    code: "R9",
    type: "recovery",
    description:
      "Oil re-refining or other reuses of oil.",
  },

  {
    code: "R10",
    type: "recovery",
    description:
      "Land treatment resulting in benefit to agriculture or ecological improvement.",
  },

  {
    code: "R11",
    type: "recovery",
    description:
      "Use of wastes obtained from any of the operations R1 to R10.",
  },

  {
    code: "R12",
    type: "recovery",
    description:
      "Exchange of wastes for submission to any of the operations R1 to R11.",
  },

  {
    code: "R13",
    type: "recovery",
    description:
      "Storage of wastes pending any of the operations R1 to R12, excluding temporary storage pending collection on the site where the waste is produced.",
  },
];

/* =========================================================
   HELPERS
========================================================= */

function normaliseEwcCode(value: string) {
  return value
    .replace(/\s/g, "")
    .replace(/\*/g, "")
    .trim();
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

/* =========================================================
   MAIN
========================================================= */

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is missing. Check your .env file.",
    );
  }

  const pool = new Pool({
    connectionString,
  });

  const database = drizzle(pool);

  try {
    console.log("");
    console.log("==========================================");
    console.log(" Waste X reference data seed");
    console.log("==========================================");
    console.log("");

    /* =====================================================
       EWC CATALOGUE
    ===================================================== */

    const rawEwcCodes =
      ewcCatalogue as RawEwcCode[];

    const ewcRecords = rawEwcCodes
      .map((item) => {
        const code = normaliseEwcCode(item.code);

        return {
          code,

          description:
            item.description.trim(),

          chapterCode:
            code.length >= 2
              ? code.slice(0, 2)
              : null,

          chapterDescription:
            item.chapter?.trim() || null,

          subChapterCode:
            code.length >= 4
              ? code.slice(0, 4)
              : null,

          subChapterDescription:
            item.subChapter?.trim() || null,

          entryType:
            item.entryTypeDesc?.trim() || null,

          isHazardous:
            Boolean(item.isHazardous),

          /*
            Important:

            The JSON already existed in Waste X.

            Do not call it "official" in the database until
            we have separately verified the source/version
            against the authoritative waste classification
            catalogue.
          */
          source:
            "waste-x-existing-catalogue",

          sourceVersion:
            "existing-repo-catalogue",

          isActive: true,

          updatedAt: new Date(),
        };
      })
      .filter(
        (item) =>
          item.code.length === 6 &&
          item.description.length > 0,
      );

    console.log(
      `Preparing ${ewcRecords.length} EWC records...`,
    );

    /*
      Batch inserts so we do not create one enormous SQL
      statement.
    */

    const ewcBatches = chunk(
      ewcRecords,
      250,
    );

    for (
      let index = 0;
      index < ewcBatches.length;
      index += 1
    ) {
      const batch = ewcBatches[index];

      await database
        .insert(ewcCodes)
        .values(batch)
        .onConflictDoUpdate({
          target: ewcCodes.code,

          set: {
            description:
              ewcCodes.description,

            /*
              These expressions intentionally get replaced
              below on new/imported data only through insert.

              Existing codes are primarily stable reference
              records.

              If you later want full external synchronisation,
              build that as a separate controlled sync.
            */
            isActive: true,
            updatedAt: new Date(),
          },
        });

      console.log(
        `EWC batch ${index + 1}/${ewcBatches.length} complete`,
      );
    }

    /* =====================================================
       D / R CODES
    ===================================================== */

    console.log("");
    console.log(
      `Preparing ${disposalRecoverySeed.length} D/R records...`,
    );

    for (const item of disposalRecoverySeed) {
      await database
        .insert(disposalRecoveryCodes)
        .values({
          code: item.code,
          type: item.type,
          description:
            item.description,
          source:
            "environment-agency",
          sourceVersion:
            "gov-uk-reporting-codes-list",
          isActive: true,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target:
            disposalRecoveryCodes.code,

          set: {
            type: item.type,

            description:
              item.description,

            source:
              "environment-agency",

            sourceVersion:
              "gov-uk-reporting-codes-list",

            isActive: true,

            updatedAt: new Date(),
          },
        });
    }

    console.log("");
    console.log("==========================================");
    console.log(" Reference data seed complete");
    console.log("==========================================");
    console.log("");
    console.log(
      `EWC records processed: ${ewcRecords.length}`,
    );
    console.log(
      `D/R records processed: ${disposalRecoverySeed.length}`,
    );
    console.log("");
  } finally {
    await pool.end();
  }
}

/* =========================================================
   RUN
========================================================= */

main().catch((error) => {
  console.error("");
  console.error(
    "Waste X reference data seed failed:",
  );
  console.error(error);
  console.error("");

  process.exit(1);
});