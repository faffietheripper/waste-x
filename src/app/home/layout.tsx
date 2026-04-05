import SetupAlert from "@/components/app/SetupAlert";
import { Toaster } from "@/components/ui/toaster";
import AppNav from "@/components/app/AppNav";
import { auth } from "@/auth";
import { database } from "@/db/database";
import { userProfiles, users } from "@/db/schema";
import { eq } from "drizzle-orm";

export default async function HomeLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  /* ===============================
     AUTH
  ============================== */
  const session = await auth();
  console.log("LAYOUT STEP 1: session", session);

  if (!session?.user?.id) {
    return <div className="p-10">Unauthorized</div>;
  }

  /* ===============================
     USER
  ============================== */
  const dbUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });

  console.log("LAYOUT STEP 2: dbUser", dbUser);

  if (!dbUser) {
    return <div className="p-10">User not found</div>;
  }

  /* ===============================
     PROFILE
  ============================== */
  const profile = await database.query.userProfiles.findFirst({
    where: eq(userProfiles.userId, session.user.id),
  });

  console.log("LAYOUT STEP 3: profile", profile);

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

  const safeRole = session.user.role ?? "user";

  /* ===============================
     RENDER
  ============================== */
  return (
    <div>
      <AppNav />
      <Toaster />
      <SetupAlert
        user={{
          role: safeRole,
          profileCompleted,
        }}
      />
      <div>{children}</div>
    </div>
  );
}
