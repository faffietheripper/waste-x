import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";
import { users } from "@/db/schema";
import { requireSoloRouteAccess } from "@/modules/solo-permissions/core/soloRouteAccess";

export default async function OrganisationSettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const currentUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    with: {
      organisation: true,
    },
  });

  if (!currentUser) {
    redirect("/login");
  }

  /*
   * Platform administrators belong to the Waste X platform,
   * not to a customer organisation.
   */
  if (currentUser.role === "platform_admin") {
    redirect("/admin");
  }

  /*
   * IMPORTANT:
   *
   * A brand-new customer has no organisation yet.
   * They MUST be allowed to access this route so that they
   * can create their organisation in the first place.
   *
   * Do not run Solo permission checks until an organisation
   * actually exists.
   */
  if (!currentUser.organisationId || !currentUser.organisation) {
    return children;
  }

  /*
   * Once the user belongs to an organisation, normal
   * organisation-management permission rules apply.
   */
  await requireSoloRouteAccess("permissions:manage");

  return children;
}