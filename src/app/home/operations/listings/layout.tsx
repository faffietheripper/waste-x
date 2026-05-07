import React from "react";
import { auth } from "@/auth";
import ListingsNav from "@/components/app/Navigation/ListingsNav";

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
      <div className=" pl-[20vw]">{children}</div>
    </div>
  );
}
