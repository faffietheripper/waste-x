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
  try {
    /* ===============================
       AUTH (NON-BLOCKING)
    ============================== */
    const session = await auth();

    // ❗ DO NOT redirect in layout
    if (!session?.user?.id) {
      return (
        <div className="p-10">
          <h2 className="text-lg font-semibold">Unauthorized</h2>
        </div>
      );
    }

    /* ===============================
       USER FETCH (SAFE)
    ============================== */
    const dbUser = await database.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (!dbUser) {
      return (
        <div className="p-10">
          <h2 className="text-lg font-semibold">User not found</h2>
        </div>
      );
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
       SAFE ROLE
    ============================== */
    const safeRole = session.user.role ?? "user";

    /* ===============================
       RENDER (PURE UI)
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
