import React from "react";
import { auth } from "@/auth";
import OrganisationNav from "@/components/app/Navigation/OrganisationNav";

export default async function ListingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  return (
    <div className="relative">
      <OrganisationNav />
      <div className="pl-[24vw]">{children}</div>
    </div>
  );
}
