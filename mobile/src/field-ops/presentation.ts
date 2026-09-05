import type { MobileAssignmentV1 } from "@waste-x/contracts";

const COMPLETED_STATUSES = new Set([
  "completed",
  "delivered",
  "received",
  "disposed",
]);

const CANCELLED_STATUSES = new Set([
  "cancelled",
  "canceled",
  "rejected",
]);

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function assignmentDateKey(value: string) {
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return localDateKey(parsed);
  return value.slice(0, 10);
}

export function formatAssignmentDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function formatLongDate(date = new Date()) {
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function greetingForNow(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function isCompletedAssignment(assignment: MobileAssignmentV1) {
  // Driver workflow deliberately ends at ARRIVED_DESTINATION. Completion is a
  // receiving-site Web/Desktop decision, so Mobile history must follow the
  // canonical load status rather than inventing a Driver-side completed step.
  return COMPLETED_STATUSES.has(assignment.load.status.toLowerCase());
}

export function isCancelledAssignment(assignment: MobileAssignmentV1) {
  return (
    CANCELLED_STATUSES.has(assignment.load.status.toLowerCase()) ||
    CANCELLED_STATUSES.has(assignment.job.status.toLowerCase())
  );
}

export type MobileAssignmentBuckets = {
  today: MobileAssignmentV1[];
  upcoming: MobileAssignmentV1[];
  completed: MobileAssignmentV1[];
  cancelled: MobileAssignmentV1[];
};

export function bucketMobileAssignments(
  assignments: MobileAssignmentV1[],
  now = new Date(),
): MobileAssignmentBuckets {
  const todayKey = localDateKey(now);
  const today: MobileAssignmentV1[] = [];
  const upcoming: MobileAssignmentV1[] = [];
  const completed: MobileAssignmentV1[] = [];
  const cancelled: MobileAssignmentV1[] = [];

  for (const assignment of assignments) {
    if (isCancelledAssignment(assignment)) {
      cancelled.push(assignment);
      continue;
    }
    if (isCompletedAssignment(assignment)) {
      completed.push(assignment);
      continue;
    }

    const key = assignmentDateKey(assignment.job.jobDate);
    // Unfinished work dated before today is carry-over operational work and
    // must remain visible on My Day rather than disappearing into history.
    if (key <= todayKey) today.push(assignment);
    else upcoming.push(assignment);
  }

  const sort = (left: MobileAssignmentV1, right: MobileAssignmentV1) => {
    const date = assignmentDateKey(left.job.jobDate).localeCompare(
      assignmentDateKey(right.job.jobDate),
    );
    if (date !== 0) return date;
    const job = left.job.jobNumber.localeCompare(right.job.jobNumber);
    if (job !== 0) return job;
    return left.load.loadNumber - right.load.loadNumber;
  };

  today.sort(sort);
  upcoming.sort(sort);
  completed.sort(sort);
  cancelled.sort(sort);

  return { today, upcoming, completed, cancelled };
}

export function humanStatus(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function formatWeight(assignment: MobileAssignmentV1) {
  if (!assignment.load.netWeight) return null;
  const unit =
    assignment.load.weightMetric === "Tonnes"
      ? "t"
      : assignment.load.weightMetric === "Kilograms"
        ? "kg"
        : "g";
  return `${assignment.load.netWeight} ${unit}`;
}
