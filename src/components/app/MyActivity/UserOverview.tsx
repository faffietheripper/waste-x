import React from "react";
import { database } from "@/db/database";
import { userProfiles } from "@/db/schema";
import { auth } from "@/auth";
import { eq } from "drizzle-orm";
import Image from "next/image";
import { getImageUrl } from "@/util/files";
import Link from "next/link";
import { redirect } from "next/navigation";

/* =========================================================
   HELPERS
========================================================= */

function fallback(value: string | null | undefined) {
  return value && value.trim().length > 0 ? value : "Not provided";
}

/* =========================================================
   COMPONENT
========================================================= */

export default async function UserOverview() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
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
    console.error("Failed to load user overview:", error);

    return (
      <section className="rounded-3xl border border-red-200 bg-red-50 p-8 text-sm text-red-700 shadow-sm">
        <p className="font-semibold">Failed to load profile data.</p>
        <p className="mt-2 leading-6">
          Waste X could not retrieve your profile information. Please refresh
          the page or try again later.
        </p>
      </section>
    );
  }

  if (!profile) {
    return (
      <section className="rounded-3xl border border-orange-200 bg-orange-50 p-8 text-sm text-orange-800 shadow-sm">
        <p className="font-semibold">No profile data found.</p>
        <p className="mt-2 leading-6">
          Complete your profile so Waste X can attach your actions to clear
          audit, assignment and incident records.
        </p>

        <Link
          href="/home/settings/profile"
          className="mt-5 inline-flex rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
        >
          Complete Profile →
        </Link>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-black/10 bg-white shadow-sm">
      {/* TOP */}
      <div className="border-b border-black/5 bg-[#fbfaf7] p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-6">
            {profile.profilePicture ? (
              <Image
                height={120}
                width={120}
                src={getImageUrl(profile.profilePicture)}
                alt="Profile"
                className="h-28 w-28 rounded-full border border-black/10 object-cover shadow-sm"
              />
            ) : (
              <div className="grid h-28 w-28 place-items-center rounded-full border border-black/10 bg-black text-3xl font-semibold text-orange-400 shadow-sm">
                {fallback(profile.fullName).charAt(0).toUpperCase()}
              </div>
            )}

            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
                User Identity
              </p>

              <h2 className="mt-2 text-3xl font-semibold text-black">
                {fallback(profile.fullName)}
              </h2>

              <p className="mt-2 text-sm text-black/45">
                {fallback(profile.emailAddress)}
              </p>
            </div>
          </div>

          <Link
            href="/home/settings/profile"
            className="rounded-full bg-orange-500 px-5 py-3 text-center text-sm font-semibold text-black transition hover:bg-orange-400"
          >
            Edit Profile →
          </Link>
        </div>
      </div>

      {/* CONTENT */}
      <div className="grid grid-cols-1 gap-8 p-8 xl:grid-cols-12">
        {/* CONTACT */}
        <section className="xl:col-span-7">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
              Contact Information
            </p>

            <h3 className="mt-2 text-xl font-semibold text-black">
              Profile Details
            </h3>

            <p className="mt-2 text-sm leading-6 text-black/45">
              These details are used for contact, account identification and
              operational record attribution.
            </p>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <InfoCard label="Telephone" value={fallback(profile.telephone)} />

            <InfoCard
              label="Email Address"
              value={fallback(profile.emailAddress)}
            />

            <InfoCard label="Country" value={fallback(profile.country)} />

            <InfoCard label="Region" value={fallback(profile.region)} />

            <InfoCard label="City" value={fallback(profile.city)} />

            <InfoCard label="Post Code" value={fallback(profile.postCode)} />

            <InfoCard
              label="Street Address"
              value={fallback(profile.streetAddress)}
              wide
            />
          </div>
        </section>

        {/* AUDIT / ACCOUNT CONTEXT */}
        <aside className="xl:col-span-5">
          <div className="rounded-3xl border border-black/10 bg-black p-6 text-white">
            <p className="text-xs uppercase tracking-[0.25em] text-orange-400">
              Waste X Account Context
            </p>

            <h3 className="mt-3 text-xl font-semibold">Why this matters</h3>

            <p className="mt-3 text-sm leading-6 text-white/55">
              Waste X uses your profile to identify who performed actions in
              operational workflows. This matters for assignments, verification,
              incident reporting, compliance review and chain-of-custody
              records.
            </p>

            <div className="mt-6 space-y-3">
              <ContextItem text="Assignment actions can be tied back to a named user." />
              <ContextItem text="Incident reports show who submitted the record." />
              <ContextItem text="Compliance exports can include user-level audit context." />
            </div>
          </div>

          <div className="mt-5 rounded-3xl border border-black/10 bg-[#fbfaf7] p-6">
            <p className="text-xs uppercase tracking-[0.25em] text-black/35">
              Profile ID
            </p>

            <p className="mt-2 break-all font-mono text-xs text-black/60">
              {profile.id}
            </p>

            <p className="mt-5 text-xs uppercase tracking-[0.25em] text-black/35">
              User ID
            </p>

            <p className="mt-2 break-all font-mono text-xs text-black/60">
              {profile.userId}
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}

/* =========================================================
   SMALL COMPONENTS
========================================================= */

function InfoCard({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-black/10 bg-[#fbfaf7] p-5 ${
        wide ? "md:col-span-2" : ""
      }`}
    >
      <p className="text-xs uppercase tracking-widest text-black/35">{label}</p>
      <p className="mt-2 break-words text-sm font-semibold text-black">
        {value}
      </p>
    </div>
  );
}

function ContextItem({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-sm leading-6 text-white/55">{text}</p>
    </div>
  );
}
