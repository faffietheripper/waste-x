import SetupAlert from "@/components/app/SetupAlert";
import { Toaster } from "@/components/ui/toaster";

import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { database } from "@/db/database";
import { userProfiles, users } from "@/db/schema";
import { eq } from "drizzle-orm";

import AppNav from "@/components/app/AppNav";

export default async function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();

  /* ===============================
     AUTH CHECK
  ============================== */

  if (!session?.user) {
    redirect("/login");
  }

  /* ===============================
     🔥 PLATFORM ADMIN REDIRECT
  ============================== */

  const url = headers().get("x-url") || "";

  if (session.user.role === "platform_admin" && !url.includes("/admin")) {
    redirect("/admin");
  }

  /* ===============================
     USER + ORG FETCH
  ============================== */

  const dbUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    with: {
      organisation: true,
    },
  });

  if (!dbUser) {
    redirect("/login");
  }

  /* ===============================
     GLOBAL GATING
  ============================== */

  // No organisation → force setup
  if (!dbUser.organisationId) {
    redirect("/home/team-dashboard?reason=no-organisation");
  }

  // Organisation pending
  if (dbUser.organisation?.status === "PENDING") {
    redirect("/onboarding/pending");
  }

  // Organisation rejected
  if (dbUser.organisation?.status === "REJECTED") {
    redirect("/onboarding/rejected");
  }

  /* ===============================
     PROFILE CHECK
  ============================== */

  const profile = await database.query.userProfiles.findFirst({
    where: eq(userProfiles.userId, session.user.id),
  });

  const profileCompleted = !!(
    profile?.fullName &&
    profile?.telephone &&
    profile?.emailAddress &&
    profile?.country &&
    profile?.streetAddress &&
    profile?.city &&
    profile?.region &&
    profile?.postCode
  );

  /* ===============================
     RENDER
  ============================== */

  return (
    <div>
      <AppNav />
      <Toaster />

      <div>
        <SetupAlert
          user={{
            role: session.user.role,
            profileCompleted,
          }}
        />
      </div>

      <div>{children}</div>
    </div>
  );
}
