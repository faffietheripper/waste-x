import { database } from "@/db/database";
import { departments } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export type DepartmentType = "generator" | "carrier" | "compliance";

type Input = {
  name: string;
  type: DepartmentType;
};

type Context = {
  organisationId: string;
};

export async function createDepartment(input: Input, ctx: Context) {
  /* ===============================
     VALIDATION
  ============================== */

  if (!input.name.trim()) {
    throw new Error("Department name is required");
  }

  if (!["generator", "carrier", "compliance"].includes(input.type)) {
    throw new Error("Invalid department type");
  }

  /* ===============================
     ENFORCE ONE PER TYPE
  ============================== */

  const existing = await database.query.departments.findFirst({
    where: and(
      eq(departments.organisationId, ctx.organisationId),
      eq(departments.type, input.type),
    ),
  });

  if (existing) {
    throw new Error(
      `${input.type} department already exists for this organisation`,
    );
  }

  /* ===============================
     INSERT
  ============================== */

  const id = crypto.randomUUID();

  await database.insert(departments).values({
    id,
    organisationId: ctx.organisationId,
    name: input.name.trim(),
    type: input.type,
    createdAt: new Date(),
  });

  return {
    id,
    success: true,
  };
}
