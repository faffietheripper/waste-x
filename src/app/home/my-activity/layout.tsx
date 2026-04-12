import React from "react";
import { auth } from "@/auth";
import { database } from "@/db/database";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import ActivityNav from "@/components/app/ActivityNav";
import { redirect } from "next/navigation";

/* =========================================================
   TYPES
========================================================= */

type Capability = "generator" | "carrier" | "manager";

/* =========================================================
   LAYOUT
========================================================= */

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  /* ===============================
     AUTH
  ============================== */

  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const userId = session.user.id;

  /* ===============================
     USER + ORGANISATION
  ============================== */

  const user = await database.query.users.findFirst({
    where: eq(users.id, userId),
    with: {
      organisation: true,
    },
  });

  if (!user) {
    redirect("/login");
  }

  /* ===============================
     ORG GUARD
  ============================== */

  if (!user.organisationId || !user.organisation) {
    redirect("/home/team-dashboard/team-profile?reason=no-organisation");
  }

  /* ===============================
     CAPABILITIES (SAFE)
  ============================== */

  const capabilities = (user.organisation.capabilities ?? []) as Capability[];

  if (!capabilities.length) {
    // if somehow empty → force user to fix org setup
    redirect("/home/team-dashboard/team-profile?reason=no-capabilities");
  }

  /* ===============================
     RENDER
  ============================== */

  return (
    <div className="relative">
      <ActivityNav capabilities={capabilities} />

      <main className="pl-[24vw] p-10 pt-56">{children}</main>
    </div>
  );
}
