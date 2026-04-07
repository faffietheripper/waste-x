import React from "react";
import { database } from "@/db/database";
import { users, organisations } from "@/db/schema";
import { auth } from "@/auth";
import { eq } from "drizzle-orm";
import Image from "next/image";
import { getImageUrl } from "@/util/files";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function CompanyOverview() {
  const session = await auth();

  /* ===============================
     AUTH GUARD (NO THROW)
  ============================== */

  if (!session?.user?.id) {
    redirect("/login"); // ✅ never throw in UI layer
  }

  const userId = session.user.id;

  /* ===============================
     FETCH ORGANISATION
  ============================== */

  const result = await database
    .select({
      organisation: organisations,
    })
    .from(users)
    .where(eq(users.id, userId))
    .innerJoin(organisations, eq(users.organisationId, organisations.id));

  const organisation = result[0]?.organisation;

  /* ===============================
     NO ORG → REDIRECT
  ============================== */

  if (!organisation) {
    redirect("/home/team-dashboard/team-profile?reason=no-organisation");
  }

  /* ===============================
     UI
  ============================== */

  return (
    <main className="p-8 bg-white shadow-lg rounded-lg mx-auto max-w-5xl">
      <div className="flex items-center justify-between mb-8">
        <section className="flex items-center">
          {organisation.profilePicture && (
            <div className="mr-6">
              <Image
                height={100}
                width={100}
                src={getImageUrl(organisation.profilePicture)}
                alt="Organisation Profile"
                className="w-32 h-32 rounded-full object-cover"
              />
            </div>
          )}

          <p className="text-4xl font-semibold">
            {organisation.teamName ?? "Unnamed Organisation"}
          </p>
        </section>

        <Link href="/home/team-dashboard/team-profile">
          <button className="mt-4 bg-blue-600 text-white py-2 px-4 rounded-md">
            Edit Profile
          </button>
        </Link>
      </div>

      <section className="space-y-8">
        {/* ===============================
            COMPANY OVERVIEW
        ============================== */}
        <div className="p-6 bg-gray-100 rounded-lg">
          <h2 className="text-2xl font-semibold mb-4">Company Overview</h2>
          <p className="text-md">
            {organisation.industry ?? "No industry specified"}
          </p>
        </div>

        {/* ===============================
            CONTACT INFO
        ============================== */}
        <div className="p-6 bg-gray-100 rounded-lg">
          <h2 className="text-2xl font-semibold mb-4">Contact Information</h2>

          <p>
            <strong>Telephone:</strong> {organisation.telephone ?? "-"}
          </p>
          <p>
            <strong>Email Address:</strong> {organisation.emailAddress ?? "-"}
          </p>
          <p>
            <strong>Country:</strong> {organisation.country ?? "-"}
          </p>
          <p>
            <strong>Street Address:</strong> {organisation.streetAddress ?? "-"}
          </p>
          <p>
            <strong>City:</strong> {organisation.city ?? "-"}
          </p>
          <p>
            <strong>Region:</strong> {organisation.region ?? "-"}
          </p>
          <p>
            <strong>Post Code:</strong> {organisation.postCode ?? "-"}
          </p>
        </div>

        {/* ===============================
            CHAIN OF CUSTODY
        ============================== */}
        {organisation.chainOfCustody && (
          <div className="p-6 bg-gray-100 rounded-lg">
            <h2 className="text-2xl font-semibold mb-4">Chain of Custody</h2>
            <p>{organisation.chainOfCustody}</p>
          </div>
        )}
      </section>
    </main>
  );
}
