// src/app/admin/digital-waste-tracking/pat/pat-action-state.ts

export type PatActionIntent =
  | "seed"
  | "save"
  | "ready"
  | "sent"
  | "confirmed"
  | "attach_submission";

export type DefraStatus =
  | "not_started"
  | "ready_to_send"
  | "submitted_to_defra"
  | "confirmed_by_defra"
  | "needs_more_info"
  | "unable_to_run"
  | "failed";

export type PatActionState = {
  ok: boolean;
  message: string;
  intent?: PatActionIntent;
  scenarioId?: string;
  timestamp: number;
};

export const initialPatActionState: PatActionState = {
  ok: false,
  message: "",
  timestamp: 0,
};
