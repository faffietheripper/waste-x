import React from "react";
import { auth } from "@/auth";
import CarriersFilter from "@/components/app/WasteCarriers/CarriersFilter";
import { database } from "@/db/database";
import { organisations } from "@/db/schema";
import { eq } from "drizzle-orm";

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  const carrierOrganisations = await database
    .select()
    .from(organisations)
    .where(eq(organisations.chainOfCustody, "wasteCarrier"));

  return (
    <div className="relative">
      <div className="h-[15vw] w-[100vw] shadow-md pl-[24vw] pt-[13vh] shadow-gray-400 pb-8 fixed bg-gray-50">
        <CarriersFilter organisations={carrierOrganisations} />
      </div>

      <div className="pl-[24vw] h-screen overflow-y-scroll py-64 px-12">
        {children}
      </div>
    </div>
  );
}
