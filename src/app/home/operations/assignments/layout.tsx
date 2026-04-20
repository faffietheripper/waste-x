import React from "react";
import { auth } from "@/auth";
import AssignmentsNav from "@/components/app/Navigation/AssignmentsNav";

export default async function AssignmentsLayout({
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
      <AssignmentsNav />
      <div className="">{children}</div>
    </div>
  );
}
