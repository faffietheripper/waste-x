import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";
import { users } from "@/db/schema";

export async function requireActiveSession() {
  const session = await auth();

  const sessionUser = session?.user as any;

  if (!sessionUser?.id) {
    redirect("/login");
  }

  const sessionToken = sessionUser.activeSessionToken;

  if (!sessionToken) {
    redirect("/login?reason=session-invalid");
  }

  const dbUser = await database.query.users.findFirst({
    where: eq(users.id, sessionUser.id),
    columns: {
      id: true,
      activeSessionToken: true,
      isActive: true,
      isSuspended: true,
    },
  });

  if (!dbUser || !dbUser.isActive || dbUser.isSuspended) {
    redirect("/login?reason=account-disabled");
  }

  if (dbUser.activeSessionToken !== sessionToken) {
    redirect("/login?reason=session-replaced");
  }

  await database
    .update(users)
    .set({
      lastSeenAt: new Date(),
    })
    .where(eq(users.id, sessionUser.id));

  return session;
}