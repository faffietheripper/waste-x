import React from "react";
import { database } from "@/db/database";
import { organisations } from "@/db/schema";
import { eq } from "drizzle-orm";
import CarriersCard from "@/components/app/WasteCarriers/CarriersCard";

type PageProps = {
  searchParams?: {
    location?: string;
  };
};

export default async function FilteredCarriersProfilesPage({
  searchParams,
}: PageProps) {
  const location = searchParams?.location;

  const allOrganisations = await database
    .select({
      id: organisations.id,
      teamName: organisations.teamName,
      profilePicture: organisations.profilePicture,
      city: organisations.city,
      country: organisations.country,
      region: organisations.region,
      chainOfCustody: organisations.chainOfCustody,
    })
    .from(organisations)
    .where(eq(organisations.chainOfCustody, "wasteCarrier"));

  const filteredOrganisations = allOrganisations.filter((org) => {
    if (location) return org.region === location;
    return true;
  });

  return (
    <main>
      <h1 className="font-bold text-3xl text-center mt-8 mb-14">
        Waste Carriers
      </h1>

      <div className="grid grid-cols-3 gap-6 px-10">
        {filteredOrganisations.length > 0 ? (
          filteredOrganisations.map((organisation) => (
            <CarriersCard key={organisation.id} organisation={organisation} />
          ))
        ) : (
          <p>No waste carriers match your criteria.</p>
        )}
      </div>
    </main>
  );
}
