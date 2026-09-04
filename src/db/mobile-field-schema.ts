import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { jobLoads, organisations } from "./schema";

export type JobLoadFieldStep =
  | "ASSIGNED"
  | "STARTED"
  | "EN_ROUTE"
  | "ARRIVED_COLLECTION"
  | "COLLECTED"
  | "IN_TRANSIT"
  | "ARRIVED_DESTINATION"
  | "DELIVERED";

export type JobLoadFieldEventType =
  | "FIELD_JOB_STARTED"
  | "FIELD_EN_ROUTE"
  | "FIELD_ARRIVED_COLLECTION"
  | "FIELD_COLLECTED"
  | "FIELD_IN_TRANSIT"
  | "FIELD_ARRIVED_DESTINATION"
  | "FIELD_DELIVERED";

/**
 * Driver-facing progress is deliberately separate from bb_job_load.status.
 *
 * bb_job_load.status remains the canonical waste/compliance state
 * (planned/arrived/accepted/completed/etc). This 1:1 sidecar gives Web,
 * Desktop and Mobile a durable current field journey state for the same
 * jobLoadId without overloading regulatory semantics.
 */
export const jobLoadFieldStates = pgTable(
  "bb_job_load_field_state",
  {
    jobLoadId: text("jobLoadId")
      .primaryKey()
      .references(() => jobLoads.id, { onDelete: "cascade" }),
    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    step: text("step")
      .$type<JobLoadFieldStep>()
      .notNull()
      .default("ASSIGNED"),
    lastEventType: text("lastEventType").$type<JobLoadFieldEventType>(),
    occurredAt: timestamp("occurredAt", { mode: "date" }),
    updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index("job_load_field_state_org_idx").on(table.organisationId),
    stepIdx: index("job_load_field_state_step_idx").on(
      table.organisationId,
      table.step,
    ),
  }),
);
