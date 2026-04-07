"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  createUploadUrlAction,
  saveProfileAction,
  fetchProfileAction,
} from "@/app/home/team-dashboard/team-profile/actions";
import { getImageUrl } from "@/util/files";
import { useAction } from "@/lib/actions/useAction";

/* =========================================================
   TYPES
========================================================= */

interface ProfileData {
  profilePicture?: string | null;
  chainOfCustody?: string | null;
  teamName?: string | null;
  industry?: string | null;
  telephone?: string | null;
  emailAddress?: string | null;
  streetAddress?: string | null;
  postCode?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
}

/* =========================================================
   COMPONENT
========================================================= */

export default function TeamProfileForm() {
  const [profileData, setProfileData] = useState<ProfileData>({});
  const [newProfilePicture, setNewProfilePicture] = useState<File | null>(null);
  const [chainOfCustody, setChainOfCustody] = useState("wasteGenerator");
  const [loading, setLoading] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const run = useAction();

  const reason = searchParams.get("reason");

  /* =========================================================
     LOAD PROFILE
  ========================================================= */

  useEffect(() => {
    async function loadProfile() {
      const profile = await run(() => fetchProfileAction());

      if (profile) {
        setProfileData(profile);

        if (profile.chainOfCustody) {
          setChainOfCustody(profile.chainOfCustody);
        }
      }
    }

    loadProfile();
  }, [run]);

  /* =========================================================
     FILE CHANGE
  ========================================================= */

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setNewProfilePicture(files[0]);
  };

  /* =========================================================
     SUBMIT
  ========================================================= */

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const form = e.currentTarget;
    const formData = new FormData(form);

    try {
      /* ===============================
         FILE UPLOAD (SAFE)
      ============================== */

      if (newProfilePicture) {
        const uploadUrls = await run(() =>
          createUploadUrlAction(
            [newProfilePicture.name],
            [newProfilePicture.type],
          ),
        );

        if (uploadUrls?.[0]) {
          await fetch(uploadUrls[0], {
            method: "PUT",
            body: newProfilePicture,
          });

          // attach uploaded key
          formData.set("profilePicture", newProfilePicture.name);
        }
      }

      /* ===============================
         SAVE PROFILE
      ============================== */

      await run(() => saveProfileAction(formData));

      router.push("/home/my-activity");
    } finally {
      setLoading(false);
    }
  };

  /* =========================================================
     UI
  ========================================================= */

  return (
    <main className="p-6">
      {reason === "no-organisation" && (
        <div className="mb-6 p-4 bg-yellow-100 border border-yellow-300 text-yellow-800 rounded-md">
          You’ve been redirected because no organisation data was found for your
          account. Please complete your team profile below.
        </div>
      )}

      <form
        className="flex flex-col rounded-xl space-y-5 pb-10"
        onSubmit={handleSubmit}
      >
        {/* PROFILE IMAGE */}
        <div className="grid justify-items-center">
          <h1 className="pb-2 font-semibold text-sm">Profile Picture</h1>

          {profileData.profilePicture && (
            <img
              src={getImageUrl(profileData.profilePicture)}
              alt="Profile"
              className="rounded-full mb-4 h-32 w-32 object-cover"
            />
          )}

          <input
            type="file"
            name="profilePicture"
            onChange={handleFileChange}
            className="mt-2"
          />
        </div>

        {/* CHAIN OF CUSTODY */}
        <section>
          <label className="block text-sm font-medium mt-4">
            Chain of Custody
          </label>

          <select
            name="chainOfCustody"
            value={chainOfCustody}
            onChange={(e) => setChainOfCustody(e.target.value)}
            className="w-full border rounded-md mt-2 px-3 py-2 text-sm"
          >
            <option value="wasteGenerator">Waste Generator</option>
            <option value="wasteManager">Waste Manager</option>
            <option value="wasteCarrier">Waste Carrier</option>
          </select>
        </section>

        {/* DETAILS */}
        <section>
          <h1 className="pb-2 font-semibold text-sm">Profile Details</h1>

          <input
            required
            name="teamName"
            placeholder="Team Name"
            defaultValue={profileData.teamName || ""}
            className="w-full border rounded-md mt-2 px-3 py-2 text-sm"
          />

          <input
            required
            name="industry"
            placeholder="Industry"
            defaultValue={profileData.industry || ""}
            className="w-full border rounded-md mt-2 px-3 py-2 text-sm"
          />
        </section>

        {/* CONTACT */}
        <section className="grid grid-cols-3 gap-4">
          <input
            required
            name="telephone"
            placeholder="Telephone"
            defaultValue={profileData.telephone || ""}
            className="border rounded-md px-3 py-2 text-sm"
          />

          <input
            required
            name="emailAddress"
            placeholder="Email Address"
            defaultValue={profileData.emailAddress || ""}
            className="col-span-2 border rounded-md px-3 py-2 text-sm"
          />
        </section>

        {/* ADDRESS */}
        <section className="space-y-3">
          <input
            required
            name="streetAddress"
            placeholder="Street Address"
            defaultValue={profileData.streetAddress || ""}
            className="w-full border rounded-md px-3 py-2 text-sm"
          />

          <div className="grid grid-cols-3 gap-4">
            <input
              required
              name="postCode"
              placeholder="Post Code"
              defaultValue={profileData.postCode || ""}
              className="border rounded-md px-3 py-2 text-sm"
            />

            <input
              required
              name="city"
              placeholder="City"
              defaultValue={profileData.city || ""}
              className="border rounded-md px-3 py-2 text-sm"
            />

            <input
              required
              name="region"
              placeholder="Region"
              defaultValue={profileData.region || ""}
              className="border rounded-md px-3 py-2 text-sm"
            />
          </div>

          <input
            required
            name="country"
            placeholder="Country"
            defaultValue={profileData.country || ""}
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
        </section>

        <button
          disabled={loading}
          className="bg-blue-600 text-white py-2 px-4 rounded-md self-end disabled:opacity-50"
          type="submit"
        >
          {loading ? "Saving..." : "Save Profile"}
        </button>
      </form>
    </main>
  );
}
