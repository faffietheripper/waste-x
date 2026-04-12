import React from "react";
import { auth } from "@/auth";
import { database } from "@/db/database";
import { organisations, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import CarrierHubNav from "@/components/app/CarrierHub/CarrierHubNav";

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
     USER
  ============================== */

  const dbUser = await database.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { organisationId: true },
  });

  if (!dbUser?.organisationId) {
    redirect("/home/team-dashboard/team-profile?reason=no-organisation");
  }

  /* ===============================
     ORGANISATION
  ============================== */

  const organisation = await database.query.organisations.findFirst({
    where: eq(organisations.id, dbUser.organisationId),
  });

  if (!organisation) {
    redirect("/home/team-dashboard/team-profile?reason=no-organisation");
  }

  /* ===============================
     CAPABILITIES (SAFE)
  ============================== */

  const capabilities = (organisation.capabilities ?? []) as Capability[];

  // 🚫 If org has no relevant capabilities → block access
  if (!capabilities.includes("carrier") && !capabilities.includes("manager")) {
    redirect("/home"); // or a "no access" page if you build one later
  }

  /* ===============================
     RENDER
  ============================== */

  return (
    <div className="relative">
      {/* NAV */}
      <CarrierHubNav capabilities={capabilities} />

      {/* CONTENT */}
      <div className="pl-[24vw] pt-56 p-10">{children}</div>
    </div>
  );
}
