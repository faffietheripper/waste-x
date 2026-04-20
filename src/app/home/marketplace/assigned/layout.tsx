import React from "react";
import { auth } from "@/auth";
import ListingsAssignmentsNav from "@/components/app/Navigation/ListingAssignmentNav";

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
      <ListingsAssignmentsNav />
      <div className="pl-[24vw]">{children}</div>
    </div>
  );
}
