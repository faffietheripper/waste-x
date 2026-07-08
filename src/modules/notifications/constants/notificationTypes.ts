export const NOTIFICATION_TYPES = {
  BID_RECEIVED: "bid_received",

  MANAGER_ASSIGNED: "manager_assigned",
  MANAGER_ACCEPTED: "manager_accepted",
  MANAGER_REJECTED: "manager_rejected",

  CARRIER_ASSIGNED: "carrier_assigned",
  CARRIER_ASSIGNED_TO_LISTING: "carrier_assigned_to_listing",
  CARRIER_ACCEPTED: "carrier_accepted",
  CARRIER_REJECTED: "carrier_rejected",

  VERIFICATION_CODE_GENERATED: "verification_code_generated",
  VERIFICATION_CODE_ACTIVE: "verification_code_active",

  COLLECTION_VERIFIED: "collection_verified",

  WASTE_RECEIVED_COMPLETED: "waste_received_completed",
  ASSIGNMENT_COMPLETED: "assignment_completed",

  INCIDENT_REPORTED: "incident_reported",
  INCIDENT_RESOLVED: "incident_resolved",

  SUPPORT_WAITING_ON_USER: "support_waiting_on_user",
  SUPPORT_REPLY_ADDED: "support_reply_added",

  SYSTEM_ALERT: "system_alert",
  PROFILE_SETUP: "system_profile_setup",
  ORGANISATION_SETUP: "system_organisation_setup",
  DEPARTMENT_SETUP: "system_department_setup",
  ROLE_SETUP: "system_role_setup",
} as const;

export type NotificationType =
  (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];