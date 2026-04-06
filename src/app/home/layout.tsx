import SetupAlert from "@/components/app/SetupAlert";
import { Toaster } from "@/components/ui/toaster";
import AppNav from "@/components/app/AppNav";
import { auth } from "@/auth";
import { database } from "@/db/database";
import { userProfiles, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

export default async function HomeLayout({
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

  /* ===============================
     USER + ORG
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
     🔥 GLOBAL GATING (HERE)
  ============================== */

  // 🚫 NO ORGANISATION
  if (!dbUser.organisationId || !dbUser.organisation) {
    redirect("/home/team-dashboard?reason=no-organisation");
  }

  const organisation = dbUser.organisation;

  // 🚫 STATUS GATES
  if (organisation.status === "PENDING") {
    redirect("/onboarding/pending");
  }

  if (organisation.status === "REJECTED") {
    redirect("/onboarding/rejected");
  }

  /* ===============================
     PROFILE
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
      <AppNav user={dbUser} profile={profile} />

      <Toaster />

      <SetupAlert
        user={{
          role: dbUser.role,
          profileCompleted,
        }}
      />

      <div>{children}</div>
    </div>
  );
}
