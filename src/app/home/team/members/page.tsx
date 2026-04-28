import { auth } from "@/auth";
import { database } from "@/db/database";
import { users } from "@/db/schema";
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

  const members = allUsers.filter((u: any) => u.status === "ACTIVE");
  const invited = allUsers.filter((u: any) => u.status === "INVITED");

  return <MembersClient members={members} invited={invited} />;
}
