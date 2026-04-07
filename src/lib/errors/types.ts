export type WasteXErrorContext = {
  userId?: string;
  organisationId?: string;
  route?: string;
  method?: string;
};

export type WasteXErrorSystem = {
  layer: "api" | "db" | "auth" | "validation" | "external";
  service?: string;
};

export type HandleErrorOptions = {
  code?: string;
  severity?: "low" | "medium" | "high" | "critical";
  context?: WasteXErrorContext;
  system?: WasteXErrorSystem;
  metadata?: Record<string, any>;
};
