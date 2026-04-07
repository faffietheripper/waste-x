import React from "react";
import { database } from "@/db/database";
import { userProfiles } from "@/db/schema";
import { auth } from "@/auth";
import { eq } from "drizzle-orm";
import Image from "next/image";
import { getImageUrl } from "@/util/files";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function UserOverview() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login"); // ✅ better than throwing
  }

  const userId = session.user.id;

  let profile;

  try {
    const profileArray = await database
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId));

    profile = profileArray[0];
  } catch (error) {
    // Optional: later we can plug server-side handleError here
    return <div className="p-6 text-red-600">Failed to load profile data.</div>;
  }

  if (!profile) {
    return <div className="p-6 text-gray-500">No profile data found.</div>;
  }

  return (
    <main className="p-8 bg-white shadow-lg rounded-lg mx-auto">
      <div className="flex items-center justify-between mb-8">
        <section className="flex items-center">
          {profile.profilePicture && (
            <div className="mr-6">
              <Image
                height={100}
                width={100}
                src={getImageUrl(profile.profilePicture)}
                alt="Profile"
                className="w-32 h-32 rounded-full object-cover"
              />
            </div>
          )}
          <p className="text-4xl font-semibold">{profile.fullName}</p>
        </section>

        <Link href="/home/me">
          <button className="mt-4 bg-blue-600 text-white py-2 px-4 rounded-md">
            Edit Profile
          </button>
        </Link>
      </div>

      <section className="space-y-8">
        <div className="p-6 bg-gray-100 rounded-lg">
          <h2 className="text-2xl font-semibold mb-4">Contact Information</h2>

          <p>
            <strong>Telephone:</strong> {profile.telephone}
          </p>
          <p>
            <strong>Email Address:</strong> {profile.emailAddress}
          </p>
          <p>
            <strong>Country:</strong> {profile.country}
          </p>
          <p>
            <strong>Street Address:</strong> {profile.streetAddress}
          </p>
          <p>
            <strong>City:</strong> {profile.city}
          </p>
          <p>
            <strong>Region:</strong> {profile.region}
          </p>
          <p>
            <strong>Post Code:</strong> {profile.postCode}
          </p>
        </div>
      </section>
    </main>
  );
}
