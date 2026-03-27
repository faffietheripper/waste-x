"use server";

import { auth } from "@/auth";
import { database } from "@/db/database";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import TeamManagementClient from "@/components/app/TeamDashboard/TeamManagementClient";
import TeamDashboardClient from "@/components/app/TeamDashboard/TeamDashboardClient";

export default async function TeamManagementPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const user = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });

  if (!user || user.role !== "administrator") {
    redirect("/home"); // 🔒 admin only
  }

  const teamMembers = await database.query.users.findMany({
    where: eq(users.organisationId, user.organisationId!),
  });

  return (
    <TeamDashboardClient userRole={user.role}>
      <TeamManagementClient users={teamMembers} />
    </TeamDashboardClient>
  );
}
