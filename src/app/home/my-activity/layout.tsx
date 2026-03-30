import React from "react";
import { auth } from "@/auth";
import { database } from "@/db/database";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import ActivityNav from "@/components/app/ActivityNav";
import { redirect } from "next/navigation";

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  // 🔹 Protect route
  if (!session?.user?.id) {
    redirect("/login");
  }

  // 🔹 Fetch user + organisation
  const user = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    with: {
      organisation: true,
    },
  });

  // 🔹 Ensure organisation exists
  if (!user?.organisationId || !user?.organisation) {
    redirect("/home/team-dashboard/team-profile?reason=no-organisation");
  }

  // 🔹 Extract chain of custody safely
  const rawChain = user.organisation.chainOfCustody;
  const chainOfCustody = user.organisation.chainOfCustody;

  return (
    <div className="relative">
      <ActivityNav chainOfCustody={chainOfCustody} />
      <main className="pl-[24vw] p-10 pt-56">{children}</main>
    </div>
  );
}
