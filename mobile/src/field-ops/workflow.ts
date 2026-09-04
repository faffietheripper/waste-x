import type {
  MobileAssignmentV1,
  MobileCollectionChecksV1,
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
  Exclude<MobileFieldWorkflowStepV1, "DELIVERED">,
  MobileFieldWorkflowAction
> = {
  ASSIGNED: {
    eventType: "FIELD_JOB_STARTED",
    fromStep: "ASSIGNED",
    toStep: "STARTED",
    label: "Start job",
    helper: "Begin this assigned load on this phone.",
  },
  STARTED: {
    eventType: "FIELD_EN_ROUTE",
    fromStep: "STARTED",
    toStep: "EN_ROUTE",
    label: "Mark en route",
    helper: "Record that you are travelling to the collection point.",
  },
  EN_ROUTE: {
    eventType: "FIELD_ARRIVED_COLLECTION",
    fromStep: "EN_ROUTE",
    toStep: "ARRIVED_COLLECTION",
    label: "Arrive at collection",
    helper: "Record arrival at the collection/origin site.",
  },
  ARRIVED_COLLECTION: {
    eventType: "FIELD_COLLECTED",
    fromStep: "ARRIVED_COLLECTION",
    toStep: "COLLECTED",
    label: "Mark collected",
    helper: "Confirm the waste and quantity before recording collection.",
  },
  COLLECTED: {
    eventType: "FIELD_IN_TRANSIT",
    fromStep: "COLLECTED",
    toStep: "IN_TRANSIT",
    label: "Mark in transit",
    helper: "Record departure from collection with the load in transit.",
  },
  IN_TRANSIT: {
    eventType: "FIELD_ARRIVED_DESTINATION",
    fromStep: "IN_TRANSIT",
    toStep: "ARRIVED_DESTINATION",
    label: "Arrive at destination",
    helper: "Record arrival at the receiving/delivery destination.",
  },
  ARRIVED_DESTINATION: {
    eventType: "FIELD_DELIVERED",
    fromStep: "ARRIVED_DESTINATION",
    toStep: "DELIVERED",
    label: "Confirm delivery",
    helper: "Add any delivery note you need, then record the driver journey as delivered.",
  },
};

const EVENT_TO_STEP: Record<
  MobileFieldWorkflowEventTypeV1,
  MobileFieldWorkflowStepV1
> = {
  FIELD_JOB_STARTED: "STARTED",
  FIELD_EN_ROUTE: "EN_ROUTE",
  FIELD_ARRIVED_COLLECTION: "ARRIVED_COLLECTION",
  FIELD_COLLECTED: "COLLECTED",
  FIELD_IN_TRANSIT: "IN_TRANSIT",
  FIELD_ARRIVED_DESTINATION: "ARRIVED_DESTINATION",
  FIELD_DELIVERED: "DELIVERED",
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

export function getMobileFieldWorkflowState(
  assignment: MobileAssignmentV1,
): MobileFieldWorkflowStateV1 {
  if (assignment.workflow) return assignment.workflow;

  return {
    step: assignment.load.status === "completed" ? "DELIVERED" : "ASSIGNED",
    updatedAt: assignment.load.movementAt,
    lastEventType: null,
  };
}

export function isMobileAssignmentReadOnly(assignment: MobileAssignmentV1) {
  return (
    TERMINAL_LOAD_STATUSES.has(assignment.load.status.toLowerCase()) ||
    NON_OPERATIONAL_JOB_STATUSES.has(assignment.job.status.toLowerCase()) ||
    getMobileFieldWorkflowState(assignment).step === "DELIVERED"
  );
}

export function getMobileCollectionChecks(
  assignment: MobileAssignmentV1,
): MobileCollectionChecksV1 {
  return (
    assignment.collectionChecks ?? {
      wasteConfirmedAt: null,
      quantityConfirmedAt: null,
      manualWeightRecordedAt: null,
    }
  );
}

export function isMobileCollectionReady(assignment: MobileAssignmentV1) {
  const checks = getMobileCollectionChecks(assignment);
  return Boolean(checks.wasteConfirmedAt && checks.quantityConfirmedAt);
}

export function getNextMobileFieldWorkflowAction(
  step: MobileFieldWorkflowStepV1,
): MobileFieldWorkflowAction | null {
  return step === "DELIVERED" ? null : ACTIONS[step];
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
      `Waste X refused an out-of-order field action from ${humanFieldWorkflowStep(current.step)}.`,
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
    case "STARTED":
      return "Job started";
    case "EN_ROUTE":
      return "En route";
    case "ARRIVED_COLLECTION":
      return "At collection";
    case "COLLECTED":
      return "Collected";
    case "IN_TRANSIT":
      return "In transit";
    case "ARRIVED_DESTINATION":
      return "At destination";
    case "DELIVERED":
      return "Delivered";
  }
}

export const MOBILE_FIELD_WORKFLOW_STEPS: MobileFieldWorkflowStepV1[] = [
  "ASSIGNED",
  "STARTED",
  "EN_ROUTE",
  "ARRIVED_COLLECTION",
  "COLLECTED",
  "IN_TRANSIT",
  "ARRIVED_DESTINATION",
  "DELIVERED",
];
