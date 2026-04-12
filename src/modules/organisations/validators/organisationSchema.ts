import { z } from "zod";

export const organisationSchema = z.object({
  teamName: z.string().min(2),
  telephone: z.string().min(5),
  emailAddress: z.string().email(),
  country: z.string(),
  streetAddress: z.string(),
  city: z.string(),
  region: z.string(),
  postCode: z.string(),
  capabilities: z.array(z.enum(["generator", "carrier", "manager"])).min(1),
});
