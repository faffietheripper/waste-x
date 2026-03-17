"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  createUploadUrlAction,
  saveProfileAction,
  fetchProfileAction,
} from "@/app/home/me/actions";
import { getImageUrl } from "@/util/files";

/* =========================================================
   TYPES
========================================================= */

interface ProfileData {
  profilePicture?: string | null;
  fullName?: string | null;
  telephone?: string | null;
  emailAddress?: string | null;
  streetAddress?: string | null;
  city?: string | null;
  region?: string | null;
  postCode?: string | null;
  country?: string | null;
}

/* =========================================================
   COMPONENT
========================================================= */

export default function ProfileForm() {
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [newProfilePicture, setNewProfilePicture] = useState<File | null>(null);

  const router = useRouter();

  /* =========================================================
     LOAD PROFILE
  ========================================================= */

  useEffect(() => {
    async function loadProfile() {
      const profile = await fetchProfileAction();
      setProfileData(profile);
      setIsLoading(false);
    }

    loadProfile();
  }, []);

  /* =========================================================
     FILE HANDLER
  ========================================================= */

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files?.[0]) {
      setNewProfilePicture(event.target.files[0]);
    }
  };

  /* =========================================================
     SUBMIT
  ========================================================= */

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const form = e.currentTarget;
    const formData = new FormData(form);

    let uploadedFileName = profileData?.profilePicture || "";

    /* ===============================
       UPLOAD PROFILE IMAGE
    ============================== */

    if (newProfilePicture) {
      const [signedUrl] = await createUploadUrlAction(
        [newProfilePicture.name],
        [newProfilePicture.type],
      );

      if (signedUrl) {
        await fetch(signedUrl, {
          method: "PUT",
          body: newProfilePicture,
        });

        uploadedFileName = newProfilePicture.name;
      }
    }

    /* ===============================
       SAVE PROFILE
    ============================== */

    await saveProfileAction({
      profilePicture: uploadedFileName,
      fullName: (formData.get("fullName") as string) || "",
      telephone: (formData.get("telephone") as string) || "",
      emailAddress: (formData.get("emailAddress") as string) || "",
      country: (formData.get("country") as string) || "",
      streetAddress: (formData.get("streetAddress") as string) || "",
      city: (formData.get("city") as string) || "",
      region: (formData.get("region") as string) || "",
      postCode: (formData.get("postCode") as string) || "",
    });

    router.refresh();
  };

  /* =========================================================
     LOADING STATE
  ========================================================= */

  if (isLoading) {
    return <div className="p-8">Loading profile...</div>;
  }

  /* =========================================================
     UI
  ========================================================= */

  return (
    <main className="max-w-3xl mx-auto p-8">
      <form
        className="flex flex-col space-y-6 bg-white p-8 rounded-xl shadow"
        onSubmit={handleSubmit}
      >
        {/* PROFILE IMAGE */}

        <div className="text-center">
          <h2 className="font-semibold mb-4">Profile Picture</h2>

          {profileData?.profilePicture && (
            <img
              src={getImageUrl(profileData.profilePicture)}
              alt="Profile"
              className="rounded-full h-32 w-32 object-cover mx-auto mb-4"
            />
          )}

          <input type="file" onChange={handleFileChange} />
        </div>

        {/* NAME */}

        <div>
          <label className="block text-sm font-medium mb-2">Full Name</label>
          <input
            required
            name="fullName"
            defaultValue={profileData?.fullName || ""}
            className="w-full border rounded-md px-3 py-2"
          />
        </div>

        {/* CONTACT */}

        <div className="grid grid-cols-2 gap-4">
          <input
            required
            name="telephone"
            placeholder="Telephone"
            defaultValue={profileData?.telephone || ""}
            className="border rounded-md px-3 py-2"
          />

          <input
            required
            name="emailAddress"
            placeholder="Email Address"
            defaultValue={profileData?.emailAddress || ""}
            className="border rounded-md px-3 py-2"
          />
        </div>

        {/* ADDRESS */}

        <input
          required
          name="streetAddress"
          placeholder="Street Address"
          defaultValue={profileData?.streetAddress || ""}
          className="border rounded-md px-3 py-2"
        />

        <div className="grid grid-cols-3 gap-4">
          <input
            required
            name="postCode"
            placeholder="Post Code"
            defaultValue={profileData?.postCode || ""}
            className="border rounded-md px-3 py-2"
          />

          <input
            required
            name="city"
            placeholder="City"
            defaultValue={profileData?.city || ""}
            className="border rounded-md px-3 py-2"
          />

          <input
            required
            name="region"
            placeholder="Region"
            defaultValue={profileData?.region || ""}
            className="border rounded-md px-3 py-2"
          />
        </div>

        <input
          required
          name="country"
          placeholder="Country"
          defaultValue={profileData?.country || ""}
          className="border rounded-md px-3 py-2"
        />

        {/* SUBMIT */}

        <button
          type="submit"
          className="bg-blue-600 text-white px-6 py-3 rounded-md self-end"
        >
          Save Profile
        </button>
      </form>
    </main>
  );
}
