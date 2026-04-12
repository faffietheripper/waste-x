import { z } from "zod";

export const createTicketSchema = z.object({
  category: z.enum([
    "bug",
    "billing",
    "access",
    "feature_request",
    "compliance",
    "other",
  ]),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  message: z.string().min(5),
});
