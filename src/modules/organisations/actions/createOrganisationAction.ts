"use server";

import { auth } from "@/auth";
import { database } from "@/db/database";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

import { createOrganisation } from "../core/createOrganisation";
import { organisationSchema } from "../validators/organisationSchema";

function readRequiredString(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string") return "";

  return value.trim();
}

function readOptionalString(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string") return null;

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function readCapabilities(formData: FormData) {
  return formData
    .getAll("capabilities")
    .map((value) => String(value).trim())
    .filter(Boolean);
}

export async function createOrganisationAction(formData: FormData) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("UNAUTHORIZED");
  }

  const operatingMode =
    readOptionalString(formData, "operatingMode") ?? "team";

  const capabilities = readCapabilities(formData);

  /*
    Demo/debug safety:
    If this logs "solo", the form is fine.
    If this logs "team" after you clicked solo, the frontend did not send solo.
  */
  console.log("CREATE ORG ACTION operatingMode:", operatingMode);
  console.log("CREATE ORG ACTION capabilities:", capabilities);

  const parsed = organisationSchema.safeParse({
    teamName: readRequiredString(formData, "teamName"),
    industry: readRequiredString(formData, "industry"),

    telephone: readRequiredString(formData, "telephone"),
    emailAddress: readRequiredString(formData, "emailAddress"),

    streetAddress: readRequiredString(formData, "streetAddress"),
    city: readRequiredString(formData, "city"),
    region: readRequiredString(formData, "region"),
    postCode: readRequiredString(formData, "postCode"),
    country: readRequiredString(formData, "country"),

    profilePicture: readOptionalString(formData, "profilePicture"),

    operatingMode,
    capabilities,
  });

  if (!parsed.success) {
    console.error("CREATE ORG VALIDATION ERROR:", parsed.error.flatten());
    throw new Error("INVALID_INPUT");
  }

  return createOrganisation({
    userId: session.user.id,
    data: parsed.data,
  });
}

export async function fetchOrganisationAction() {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const currentUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    with: {
      organisation: true,
    },
  });

  return currentUser?.organisation ?? null;
}