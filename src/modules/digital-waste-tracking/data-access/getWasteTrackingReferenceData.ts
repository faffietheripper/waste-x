// src/modules/digital-waste-tracking/data-access/getWasteTrackingReferenceData.ts

import { database } from "@/db/database";
import { wasteTrackingReferenceData } from "@/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";

import {
  parseReferenceMetadata,
  serialiseReferenceMetadata,
} from "../core/normaliseReferenceData";

import type {
  NormalisedWasteTrackingReferenceDataItem,
  WasteTrackingEnvironment,
  WasteTrackingReferenceDataType,
} from "../types/referenceData.types";

function mapReferenceDataRow(
  row: typeof wasteTrackingReferenceData.$inferSelect,
): NormalisedWasteTrackingReferenceDataItem {
  return {
    type: row.type,
    code: row.code,
    description: row.description,
    isHazardous: row.isHazardous,
    metadata: parseReferenceMetadata(row.metadata),
    environment: row.environment,
    isActive: row.isActive,
  };
}

export async function getWasteTrackingReferenceData(params?: {
  environment?: WasteTrackingEnvironment;
  types?: WasteTrackingReferenceDataType[];
  activeOnly?: boolean;
}) {
  const environment = params?.environment ?? "test";
  const activeOnly = params?.activeOnly ?? true;

  const conditions = [eq(wasteTrackingReferenceData.environment, environment)];

  if (activeOnly) {
    conditions.push(eq(wasteTrackingReferenceData.isActive, true));
  }

  if (params?.types && params.types.length > 0) {
    conditions.push(inArray(wasteTrackingReferenceData.type, params.types));
  }

  const rows = await database.query.wasteTrackingReferenceData.findMany({
    where: and(...conditions),
    orderBy: [
      asc(wasteTrackingReferenceData.type),
      asc(wasteTrackingReferenceData.code),
    ],
  });

  return rows.map(mapReferenceDataRow);
}

export async function getWasteTrackingReferenceDataByType(params: {
  environment?: WasteTrackingEnvironment;
  type: WasteTrackingReferenceDataType;
  activeOnly?: boolean;
}) {
  return getWasteTrackingReferenceData({
    environment: params.environment ?? "test",
    types: [params.type],
    activeOnly: params.activeOnly ?? true,
  });
}

export async function getWasteTrackingReferenceItem(params: {
  environment?: WasteTrackingEnvironment;
  type: WasteTrackingReferenceDataType;
  code: string;
}) {
  const row = await database.query.wasteTrackingReferenceData.findFirst({
    where: and(
      eq(wasteTrackingReferenceData.environment, params.environment ?? "test"),
      eq(wasteTrackingReferenceData.type, params.type),
      eq(wasteTrackingReferenceData.code, params.code),
      eq(wasteTrackingReferenceData.isActive, true),
    ),
  });

  return row ? mapReferenceDataRow(row) : null;
}

/* =========================================================
   UPSERT REFERENCE DATA
   Used later by syncReferenceDataAction.
========================================================= */

export async function upsertWasteTrackingReferenceData(params: {
  items: NormalisedWasteTrackingReferenceDataItem[];
}) {
  if (params.items.length === 0) {
    return {
      insertedOrUpdated: 0,
    };
  }

  let insertedOrUpdated = 0;

  for (const item of params.items) {
    await database
      .insert(wasteTrackingReferenceData)
      .values({
        type: item.type,
        code: item.code,
        description: item.description ?? null,
        isHazardous: item.isHazardous ?? null,
        metadata: serialiseReferenceMetadata(item.metadata),
        environment: item.environment,
        isActive: item.isActive,
        syncedAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          wasteTrackingReferenceData.type,
          wasteTrackingReferenceData.code,
          wasteTrackingReferenceData.environment,
        ],
        set: {
          description: item.description ?? null,
          isHazardous: item.isHazardous ?? null,
          metadata: serialiseReferenceMetadata(item.metadata),
          isActive: item.isActive,
          syncedAt: new Date(),
          updatedAt: new Date(),
        },
      });

    insertedOrUpdated += 1;
  }

  return {
    insertedOrUpdated,
  };
}