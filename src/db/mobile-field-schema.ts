import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { jobLoads, organisations } from "./schema";

export type JobLoadFieldStep =
  | "ASSIGNED"
  | "COLLECTED"
  | "IN_TRANSIT"
  | "ARRIVED_DESTINATION";

export type JobLoadFieldEventType =
  | "FIELD_COLLECTED"
  | "FIELD_IN_TRANSIT"
  | "FIELD_ARRIVED_DESTINATION";

/**
 * Driver-facing transport progress is deliberately separate from the canonical
 * receiving-site load status. The Driver stops at ARRIVED_DESTINATION. Site
 * staff then own acceptance/rejection, weights and completion.
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
