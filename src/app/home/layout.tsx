import Header from "@/components/app/Header";
import Header2 from "@/components/app/Header2";
import SetupAlert from "@/components/app/SetupAlert";
import { Toaster } from "@/components/ui/toaster";

import { auth } from "@/auth";
import { redirect } from "next/navigation";

import { database } from "@/db/database";
import { userProfiles, users, organisations } from "@/db/schema";
import { eq } from "drizzle-orm";

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
     USER + ORG FETCH (NEW)
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
     🔥 GLOBAL GATING (NEW)
  ============================== */

  // No organisation → force setup
  if (!dbUser.organisationId) {
    redirect("/home/team-dashboard?reason=no-organisation");
  }

  // Organisation exists but NOT approved
  if (dbUser.organisation?.status === "PENDING") {
    redirect("/onboarding/pending");
  }

  if (dbUser.organisation?.status === "REJECTED") {
    redirect("/onboarding/rejected");
  }

  /* ===============================
     PROFILE CHECK (EXISTING)
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

  console.log("🧩 session.user.role:", session.user.role);
  console.log("🧩 profileCompleted:", profileCompleted);

  /* ===============================
     RENDER
  ============================== */

  return (
    <div>
      <Header />
      <Toaster />
      <Header2 />

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
