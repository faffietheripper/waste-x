import SetupAlert from "@/components/app/SetupAlert";
import { Toaster } from "@/components/ui/toaster";
import AppNav from "@/components/app/AppNav";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { database } from "@/db/database";
import { userProfiles, users } from "@/db/schema";
import { eq } from "drizzle-orm";

export default async function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  try {
    /* ===============================
       AUTH CHECK (STRICT)
    ============================== */
    const session = await auth();

    if (!session?.user?.id) {
      redirect("/login");
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
      console.error("User not found for session:", session.user.id);
      redirect("/login");
    }

    /* ===============================
       GLOBAL GATING
    ============================== */

    // Organisation must exist AND relation must resolve
    if (!dbUser.organisationId || !dbUser.organisation) {
      redirect("/home/team-dashboard?reason=no-organisation");
    }

    // Organisation status checks (no optional chaining needed now)
    if (dbUser.organisation.status === "PENDING") {
      redirect("/onboarding/pending");
    }

    if (dbUser.organisation.status === "REJECTED") {
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
       SAFE ROLE HANDLING
    ============================== */

    const safeRole = session.user.role ?? "user";

    /* ===============================
       DEBUG LOGS (TEMP)
    ============================== */
    console.log("SESSION USER ID:", session.user.id);
    console.log("ROLE:", safeRole);
    console.log("PROFILE COMPLETE:", profileCompleted);

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
  } catch (error: any) {
    /* ===============================
       FAIL SAFE (CRITICAL)
    ============================== */

    console.error("HOME LAYOUT CRASH:", {
      message: error?.message,
      stack: error?.stack,
    });

    return (
      <div className="p-10">
        <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
        <p className="text-sm text-gray-500">
          We couldn’t load your workspace. Please refresh or try again.
        </p>
      </div>
    );
  }
}
