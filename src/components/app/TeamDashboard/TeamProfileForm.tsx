"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  createUploadUrlAction,
  saveProfileAction,
  fetchProfileAction,
} from "@/app/home/team-dashboard/team-profile/actions";
import { getImageUrl } from "@/util/files";

/* =========================================================
   TYPES
========================================================= */

type Capability = "generator" | "carrier" | "manager";

interface ProfileData {
  profilePicture?: string | null;
  capabilities?: Capability[];
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");

  const [profileData, setProfileData] = useState<ProfileData>({});
  const [newProfilePicture, setNewProfilePicture] = useState<File | null>(null);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<React.ReactNode | null>(null);

  /* =========================================================
     LOAD PROFILE (FIXED - NO LOOP)
  ========================================================= */

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const profile = await fetchProfileAction();

        if (profile) {
          setProfileData(profile);

          if (profile.capabilities?.length) {
            setCapabilities(profile.capabilities);
          }
        }
      } catch (err) {
        console.error("Failed to load profile:", err);
      }
    };

    loadProfile();
  }, []);

  /* =========================================================
     FILE HANDLER
  ========================================================= */

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNewProfilePicture(file);
  };

  /* =========================================================
     CAPABILITIES TOGGLE
  ========================================================= */

  const toggleCapability = (value: Capability) => {
    setCapabilities((prev) =>
      prev.includes(value) ? prev.filter((c) => c !== value) : [...prev, value],
    );
  };

  /* =========================================================
     ERROR MAPPING
  ========================================================= */

  const mapError = (err: any): React.ReactNode => {
    const code = err?.code || err?.message;

    switch (code) {
      case "PROFILE_INCOMPLETE":
        return (
          <>
            You must complete your personal profile first.{" "}
            <Link href="/home/me/account" className="underline font-medium">
              Go to profile →
            </Link>
          </>
        );

      case "NO_CAPABILITIES":
        return "Select at least one capability.";

      case "MISSING_FIELDS":
        return "Please complete all required fields.";

      case "UNAUTHORIZED":
        return "Session expired. Please log in again.";

      default:
        return "Something went wrong. Please try again.";
    }
  };

  /* =========================================================
     SUBMIT HANDLER
  ========================================================= */

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);

    try {
      /* VALIDATION */
      if (capabilities.length === 0) {
        setError("Select at least one capability.");
        return;
      }

      /* FILE UPLOAD */
      if (newProfilePicture) {
        const uploadUrls = await createUploadUrlAction(
          [newProfilePicture.name],
          [newProfilePicture.type],
        );

        if (uploadUrls?.[0]) {
          await fetch(uploadUrls[0], {
            method: "PUT",
            body: newProfilePicture,
          });

          formData.set("profilePicture", newProfilePicture.name);
        }
      }

      /* CAPABILITIES */
      formData.delete("capabilities");
      capabilities.forEach((c) => formData.append("capabilities", c));

      /* SAVE */
      await saveProfileAction(formData);

      router.push("/home/my-activity");
    } catch (err: any) {
      console.error(err);
      setError(mapError(err));
    } finally {
      setLoading(false);
    }
  };

  /* =========================================================
     UI
  ========================================================= */

  return (
    <main className="p-6 max-w-3xl mx-auto">
      {/* REDIRECT NOTICE */}
      {reason === "no-organisation" && (
        <div className="mb-6 p-4 bg-yellow-100 border border-yellow-300 text-yellow-800 rounded-md">
          No organisation found for your account. Please create one below.
        </div>
      )}

      {/* ERROR DISPLAY */}
      {error && (
        <div className="mb-6 p-4 bg-red-100 border border-red-300 text-red-800 rounded-md text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col space-y-6 pb-10">
        {/* PROFILE IMAGE */}
        <div className="grid justify-items-center">
          <h2 className="font-semibold text-sm">Profile Picture</h2>

          {profileData.profilePicture && (
            <img
              src={getImageUrl(profileData.profilePicture)}
              alt="Profile"
              className="rounded-full mt-3 mb-3 h-32 w-32 object-cover"
            />
          )}

          <input type="file" onChange={handleFileChange} />
        </div>

        {/* CAPABILITIES */}
        <section>
          <h2 className="font-semibold text-sm">Organisation Capabilities</h2>

          <p className="text-xs text-gray-500 mt-1">
            Select all roles your organisation performs. You can operate across
            multiple stages of the waste lifecycle.
          </p>

          <div className="mt-3 space-y-2">
            {[
              { label: "Waste Generator", value: "generator" },
              { label: "Waste Carrier", value: "carrier" },
              { label: "Waste Manager", value: "manager" },
            ].map((item) => (
              <label key={item.value} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={capabilities.includes(item.value as Capability)}
                  onChange={() => toggleCapability(item.value as Capability)}
                />
                {item.label}
              </label>
            ))}
          </div>
        </section>

        {/* DETAILS */}
        <section>
          <h2 className="font-semibold text-sm">Organisation Details</h2>

          <input
            required
            name="teamName"
            placeholder="Team Name"
            defaultValue={profileData.teamName || ""}
            className="w-full border rounded-md px-3 py-2 text-sm mt-2"
          />

          <input
            required
            name="industry"
            placeholder="Industry"
            defaultValue={profileData.industry || ""}
            className="w-full border rounded-md px-3 py-2 text-sm mt-2"
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

        {/* SUBMIT */}
        <button
          disabled={loading}
          className="bg-blue-600 text-white py-2 px-4 rounded-md self-end disabled:opacity-50"
        >
          {loading ? "Saving..." : "Save Organisation"}
        </button>
      </form>
    </main>
  );
}
