export type ErrorSeverity = "low" | "medium" | "high" | "critical";

export type ErrorLayer =
  | "api"
  | "db"
  | "auth"
  | "validation"
  | "external";

export type HandleErrorOptions = {
  code?: string;
  severity?: ErrorSeverity;

  system?: {
    layer?: ErrorLayer;
  };

  context?: {
    userId?: string | null;
    organisationId?: string | null;
    route?: string | null;
    method?: string | null;
  };

  metadata?: Record<string, unknown>;
};

export type ClientError = Error & {
  code?: string;
  id?: string;
};