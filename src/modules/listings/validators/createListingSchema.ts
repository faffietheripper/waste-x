import { z } from "zod";

export const createListingSchema = z.object({
  templateId: z.string().uuid(),
  templateData: z.record(z.any()),
  fileName: z.array(z.string()),
  startingPrice: z.number().min(0),
  endDate: z.date(),
  name: z.string().min(3).max(200),
  location: z.string().min(3).max(200),
});
