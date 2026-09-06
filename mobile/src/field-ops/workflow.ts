import type {
  MobileAssignmentV1,
  MobileFieldWorkflowEventTypeV1,
  MobileFieldWorkflowStateV1,
  MobileFieldWorkflowStepV1,
} from "@waste-x/contracts";

export type MobileFieldWorkflowAction = {
  eventType: MobileFieldWorkflowEventTypeV1;
  fromStep: MobileFieldWorkflowStepV1;
  toStep: MobileFieldWorkflowStepV1;
  label: string;
  helper: string;
};

const ACTIONS: Record<
  Exclude<MobileFieldWorkflowStepV1, "ARRIVED_DESTINATION">,
  MobileFieldWorkflowAction
> = {
  ASSIGNED: {
    eventType: "FIELD_COLLECTED",
    fromStep: "ASSIGNED",
    toStep: "COLLECTED",
    label: "Mark collected",
    helper: "Confirm that you have collected this assigned load.",
  },
  COLLECTED: {
    eventType: "FIELD_IN_TRANSIT",
    fromStep: "COLLECTED",
    toStep: "IN_TRANSIT",
    label: "Mark in transit",
    helper: "Confirm that the collected load is travelling to the destination.",
  },
  IN_TRANSIT: {
    eventType: "FIELD_ARRIVED_DESTINATION",
    fromStep: "IN_TRANSIT",
    toStep: "ARRIVED_DESTINATION",
    label: "Arrived at destination",
    helper: "Hand the load over to the receiving site for acceptance or rejection.",
  },
};

const EVENT_TO_STEP: Record<
  MobileFieldWorkflowEventTypeV1,
  MobileFieldWorkflowStepV1
> = {
  FIELD_COLLECTED: "COLLECTED",
  FIELD_IN_TRANSIT: "IN_TRANSIT",
  FIELD_ARRIVED_DESTINATION: "ARRIVED_DESTINATION",
};

const TERMINAL_LOAD_STATUSES = new Set([
  "completed",
  "rejected",
  "cancelled",
  "canceled",
]);

const NON_OPERATIONAL_JOB_STATUSES = new Set([
  "draft",
  "cancelled",
  "canceled",
]);

export const MOBILE_FIELD_WORKFLOW_EVENT_TYPES = Object.keys(
  EVENT_TO_STEP,
) as MobileFieldWorkflowEventTypeV1[];

export function isMobileFieldWorkflowEventType(
  value: string,
): value is MobileFieldWorkflowEventTypeV1 {
  return value in EVENT_TO_STEP;
}

export function fieldWorkflowStepForEvent(
  eventType: MobileFieldWorkflowEventTypeV1,
) {
  return EVENT_TO_STEP[eventType];
}

/**
 * Existing development/test devices can contain the earlier seven-step field
 * workflow. Collapse those values into the new transport-only model rather
 * than deleting cached work or forcing a simulator/device reset.
 */
export function normaliseMobileFieldWorkflowStep(
  value: unknown,
): MobileFieldWorkflowStepV1 {
  switch (value) {
    case "COLLECTED":
      return "COLLECTED";
    case "IN_TRANSIT":
      return "IN_TRANSIT";
    case "ARRIVED_DESTINATION":
    case "DELIVERED":
      return "ARRIVED_DESTINATION";
    case "ASSIGNED":
    case "STARTED":
    case "EN_ROUTE":
    case "ARRIVED_COLLECTION":
    default:
      return "ASSIGNED";
  }
}

export function getMobileFieldWorkflowState(
  assignment: MobileAssignmentV1,
): MobileFieldWorkflowStateV1 {
  if (assignment.workflow) {
    const raw = assignment.workflow as unknown as {
      step?: unknown;
      updatedAt?: string | null;
      lastEventType?: unknown;
    };
    const step = normaliseMobileFieldWorkflowStep(raw.step);
    const lastEventType =
      typeof raw.lastEventType === "string" &&
      isMobileFieldWorkflowEventType(raw.lastEventType)
        ? raw.lastEventType
        : null;
    return {
      step,
      updatedAt: raw.updatedAt ?? null,
      lastEventType,
    };
  }

  return {
    // Completed legacy records can safely be treated as having reached the
    // destination. Rejected cannot: a Driver may now reject while still
    // ASSIGNED before collecting anything. Site-rejected loads with a real
    // journey retain their explicit workflow history from Cloud.
    step: assignment.load.status === "completed"
      ? "ARRIVED_DESTINATION"
      : "ASSIGNED",
    updatedAt: assignment.load.movementAt,
    lastEventType: null,
  };
}

export function isMobileAssignmentReadOnly(assignment: MobileAssignmentV1) {
  return (
    TERMINAL_LOAD_STATUSES.has(assignment.load.status.toLowerCase()) ||
    NON_OPERATIONAL_JOB_STATUSES.has(assignment.job.status.toLowerCase())
  );
}

export function getNextMobileFieldWorkflowAction(
  step: MobileFieldWorkflowStepV1,
): MobileFieldWorkflowAction | null {
  return step === "ARRIVED_DESTINATION" ? null : ACTIONS[step];
}

export function applyMobileFieldWorkflowEvent(
  assignment: MobileAssignmentV1,
  eventType: MobileFieldWorkflowEventTypeV1,
  occurredAt: string,
) {
  if (isMobileAssignmentReadOnly(assignment)) {
    throw new Error("This field job is read only and can no longer be changed.");
  }

  const current = getMobileFieldWorkflowState(assignment);
  const action = getNextMobileFieldWorkflowAction(current.step);

  if (!action || action.eventType !== eventType) {
    throw new Error(
      `Waste X refused an out-of-order Driver action from ${humanFieldWorkflowStep(current.step)}.`,
    );
  }

  const next: MobileAssignmentV1 = JSON.parse(
    JSON.stringify(assignment),
  ) as MobileAssignmentV1;
  next.workflow = {
    step: action.toStep,
    updatedAt: occurredAt,
    lastEventType: eventType,
  };
  return next;
}

export function humanFieldWorkflowStep(step: MobileFieldWorkflowStepV1) {
  switch (step) {
    case "ASSIGNED":
      return "Assigned";
    case "COLLECTED":
      return "Collected";
    case "IN_TRANSIT":
      return "In transit";
    case "ARRIVED_DESTINATION":
      return "At destination";
  }
}

export const MOBILE_FIELD_WORKFLOW_STEPS: MobileFieldWorkflowStepV1[] = [
  "ASSIGNED",
  "COLLECTED",
  "IN_TRANSIT",
  "ARRIVED_DESTINATION",
];
