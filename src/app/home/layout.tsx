import SetupAlert from "@/components/app/SetupAlert";
import { Toaster } from "@/components/ui/toaster";
import AppNav from "@/components/app/AppNav";
import { auth } from "@/auth";
import { database } from "@/db/database";
import { userProfiles, users } from "@/db/schema";
import { eq } from "drizzle-orm";

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
    return <div className="p-10">Unauthorized</div>;
  }

  /* ===============================
     USER + ORG (ONE FETCH ONLY)
  ============================== */
  const dbUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    with: {
      organisation: true,
    },
  });

  if (!dbUser) {
    return <div className="p-10">User not found</div>;
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
