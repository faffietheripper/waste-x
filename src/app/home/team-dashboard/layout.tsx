import React from "react";
import { auth } from "@/auth";
import { database } from "@/db/database";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import TeamNav from "@/components/app/TeamDashboard/TeamNav";
import { redirect } from "next/navigation";

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

  /* ===============================
     NEW: CAPABILITIES
  ============================== */

  const capabilities =
    (user.organisation?.capabilities as
      | ("generator" | "carrier" | "manager")[]
      | null) ?? [];

  const userRole = user.role ?? null;

  /* ===============================
     RENDER
  ============================== */

  return (
    <div className="relative">
      <TeamNav userRole={userRole} capabilities={capabilities} />

      <div className="pl-[24vw] p-10 pt-56">{children}</div>
    </div>
  );
}
