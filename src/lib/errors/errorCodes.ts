export const ERROR_CODES = {
  /* =========================================================
     AUTH
  ========================================================= */

  AUTH_INVALID_TOKEN: "AUTH_001",
  AUTH_SESSION_EXPIRED: "AUTH_002",
  AUTH_UNAUTHORISED: "AUTH_003",
  AUTH_FORBIDDEN: "AUTH_004",

  /* =========================================================
     PERMISSIONS / ACCESS
  ========================================================= */

  ACCESS_ORGANISATION_REQUIRED: "ACCESS_001",
  ACCESS_DEPARTMENT_REQUIRED: "ACCESS_002",
  ACCESS_PERMISSION_DENIED: "ACCESS_003",
  ACCESS_OPERATION_NOT_ALLOWED: "ACCESS_004",

  /* =========================================================
     DATABASE
  ========================================================= */

  DB_CONNECTION_FAILED: "DB_001",
  DB_CONSTRAINT_ERROR: "DB_002",
  DB_RECORD_NOT_FOUND: "DB_003",

  /* =========================================================
     WASTE DOMAIN
  ========================================================= */

  WASTE_INVALID_DATA: "WASTE_001",
  WASTE_UNAUTHORISED_CARRIER: "WASTE_002",

  /* =========================================================
     LISTINGS
  ========================================================= */

  LISTING_CREATE_FAILED: "LISTING_001",
  LISTING_UPDATE_FAILED: "LISTING_002",
  LISTING_DELETE_FAILED: "LISTING_003",
  LISTING_ASSIGN_FAILED: "LISTING_004",
  LISTING_BID_FAILED: "LISTING_005",
  LISTING_ACCESS_DENIED: "LISTING_006",
  LISTING_ALREADY_ASSIGNED: "LISTING_007",
  LISTING_NOT_FOUND: "LISTING_008",

  /* =========================================================
     ASSIGNMENTS
  ========================================================= */

  ASSIGNMENT_CREATE_FAILED: "ASSIGNMENT_001",
  ASSIGNMENT_ACCEPT_FAILED: "ASSIGNMENT_002",
  ASSIGNMENT_REJECT_FAILED: "ASSIGNMENT_003",
  ASSIGNMENT_CANCEL_FAILED: "ASSIGNMENT_004",
  ASSIGNMENT_COMPLETE_FAILED: "ASSIGNMENT_005",
  ASSIGNMENT_COLLECTION_FAILED: "ASSIGNMENT_006",
  ASSIGNMENT_ACCESS_DENIED: "ASSIGNMENT_007",
  ASSIGNMENT_NOT_FOUND: "ASSIGNMENT_008",
  ASSIGNMENT_HAS_UNRESOLVED_INCIDENT: "ASSIGNMENT_009",

  /* =========================================================
     INCIDENTS
  ========================================================= */

  INCIDENT_CREATE_FAILED: "INCIDENT_001",
  INCIDENT_RESOLVE_FAILED: "INCIDENT_002",
  INCIDENT_UPDATE_FAILED: "INCIDENT_003",
  INCIDENT_ACCESS_DENIED: "INCIDENT_004",
  INCIDENT_NOT_FOUND: "INCIDENT_005",
  INCIDENT_ALREADY_RESOLVED: "INCIDENT_006",

  /* =========================================================
     TEMPLATES
  ========================================================= */

  TEMPLATE_CREATE_FAILED: "TEMPLATE_001",
  TEMPLATE_UPDATE_FAILED: "TEMPLATE_002",
  TEMPLATE_DELETE_FAILED: "TEMPLATE_003",
  TEMPLATE_ACCESS_DENIED: "TEMPLATE_004",
  TEMPLATE_NOT_FOUND: "TEMPLATE_005",

  /* =========================================================
     ORGANISATION / TEAM
  ========================================================= */

  ORGANISATION_CREATE_FAILED: "ORG_001",
  ORGANISATION_UPDATE_FAILED: "ORG_002",
  ORGANISATION_APPROVAL_FAILED: "ORG_003",
  ORGANISATION_ACCESS_DENIED: "ORG_004",

  TEAM_INVITE_FAILED: "TEAM_001",
  TEAM_MEMBER_UPDATE_FAILED: "TEAM_002",
  TEAM_MEMBER_REMOVE_FAILED: "TEAM_003",

  /* =========================================================
     FILES
  ========================================================= */

  FILE_UPLOAD_FAILED: "FILE_001",
  FILE_ACCESS_DENIED: "FILE_002",

  /* =========================================================
     SUPPORT / NOTIFICATIONS
  ========================================================= */

  SUPPORT_TICKET_FAILED: "SUPPORT_001",
  NOTIFICATION_CREATE_FAILED: "NOTIFICATION_001",

  /* =========================================================
     SYSTEM
  ========================================================= */

  SYSTEM_UNEXPECTED: "SYS_001",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];