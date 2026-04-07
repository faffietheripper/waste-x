export const ERROR_CODES = {
  // Auth
  AUTH_INVALID_TOKEN: "AUTH_001",
  AUTH_SESSION_EXPIRED: "AUTH_002",

  // Database
  DB_CONNECTION_FAILED: "DB_001",
  DB_CONSTRAINT_ERROR: "DB_002",

  // Waste domain
  WASTE_INVALID_DATA: "WASTE_001",
  WASTE_UNAUTHORISED_CARRIER: "WASTE_002",

  // System
  SYSTEM_UNEXPECTED: "SYS_001",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
