import { z } from "zod";

export const organisationCapabilities = [
  "generator",
  "carrier",
  "manager",
] as const;

export const organisationSchema = z.object({
  teamName: z.string().min(2, "Organisation name is required"),
  industry: z.string().min(2, "Industry is required"),

  telephone: z.string().min(5, "Telephone is required"),
  emailAddress: z.string().email("Valid email address is required"),

  streetAddress: z.string().min(2, "Street address is required"),
  city: z.string().min(2, "City is required"),
  region: z.string().min(2, "Region is required"),
  postCode: z.string().min(2, "Post code is required"),
  country: z.string().min(2, "Country is required"),

  profilePicture: z.string().nullable().optional(),

  capabilities: z
    .array(z.enum(organisationCapabilities))
    .min(1, "Select at least one capability"),
});

export type OrganisationInput = z.infer<typeof organisationSchema>;
export type OrganisationCapability = z.infer<
  typeof organisationSchema
>["capabilities"][number];
