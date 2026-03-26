import React from "react";
import { auth } from "@/auth";
import { database } from "@/db/database";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import TeamNav from "@/components/app/TeamDashboard/TeamNav";
import { redirect } from "next/navigation";
import TeamDashboardClient from "@/components/app/TeamDashboard/TeamDashboardClient";

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const user = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    with: {
      organisation: true,
    },
  });

  if (!user) {
    redirect("/login");
  }

  const chainOfCustody = user.organisation?.chainOfCustody ?? null;
  const userRole = user.role ?? null;
  console.log("SERVER ROLE:", userRole);

  return (
    <div className="relative">
      <TeamNav userRole={userRole} chainOfCustody={chainOfCustody} />

      <TeamDashboardClient userRole={userRole}>
        <div className="pl-[24vw] p-10 pt-56">{children}</div>
      </TeamDashboardClient>
    </div>
  );
}
