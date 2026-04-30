import { auth } from "@/auth";
import { database } from "@/db/database";
import { departments, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import MembersClient from "./MembersClient";

export default async function MembersPage() {
  const session = await auth();

  if (!session?.user?.organisationId) {
    return <div className="p-10">Unauthorized</div>;
  }

  const orgId = session.user.organisationId;

  const allUsers = await database
    .select()
    .from(users)
    .where(eq(users.organisationId, orgId));

  const orgDepartments = await database
    .select()
    .from(departments)
    .where(eq(departments.organisationId, orgId));

  const members = allUsers.filter((u) => u.status === "ACTIVE");
  const invited = allUsers.filter((u) => u.status === "INVITED");

  return (
    <MembersClient
      members={members}
      invited={invited}
      departments={orgDepartments}
    />
  );
}
