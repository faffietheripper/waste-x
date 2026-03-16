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
  companyName?: string | null;
  companyOverview?: string | null;
  telephone?: string | null;
  emailAddress?: string | null;
  streetAddress?: string | null;
  city?: string | null;
  region?: string | null;
  postCode?: string | null;
  country?: string | null;
  wasteManagementMethod?: string | null;
  servicesOffered?: string | null;
  wasteType?: string | null;
  environmentalPolicy?: string | null;
  certifications?: string | null;
}

/* =========================================================
   COMPONENT
========================================================= */

export default function WMProfileForm() {
  const [profileData, setProfileData] = useState<ProfileData>({});
  const [newProfilePicture, setNewProfilePicture] = useState<File | null>(null);
  const [newCertifications, setNewCertifications] = useState<File[]>([]);
  const router = useRouter();

  /* =========================================================
     LOAD PROFILE
  ========================================================= */

  useEffect(() => {
    async function loadProfile() {
      const profile = await fetchProfileAction();
      setProfileData(profile || {});
    }

    loadProfile();
  }, []);

  /* =========================================================
     FILE HANDLER
  ========================================================= */

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const inputFiles = event.target.files;
    const name = event.target.name;

    if (!inputFiles || inputFiles.length === 0) return;

    if (name === "profilePicture") {
      setNewProfilePicture(inputFiles[0]);
    }

    if (name === "newCertifications") {
      setNewCertifications(Array.from(inputFiles));
    }
  };

  /* =========================================================
     SUBMIT
  ========================================================= */

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const form = e.currentTarget;
    const formData = new FormData(form);

    const certificationNames = newCertifications.map((file) => file.name);
    const certificationTypes = newCertifications.map((file) => file.type);

    const uploadUrls = await createUploadUrlAction(
      [
        newProfilePicture?.name || profileData.profilePicture || "",
        ...certificationNames,
      ],
      [newProfilePicture?.type || "", ...certificationTypes],
    );

    /* Upload profile picture */

    if (newProfilePicture) {
      await fetch(uploadUrls[0], {
        method: "PUT",
        body: newProfilePicture,
      });
    }

    /* Upload certifications */

    if (newCertifications.length > 0) {
      await Promise.all(
        newCertifications.map((file, index) =>
          fetch(uploadUrls[index + 1], {
            method: "PUT",
            body: file,
          }),
        ),
      );
    }

    /* Save profile */

    await saveProfileAction({
      profilePicture:
        newProfilePicture?.name || profileData.profilePicture || "",
      companyName: formData.get("companyName") as string,
      companyOverview: formData.get("companyOverview") as string,
      telephone: formData.get("telephone") as string,
      emailAddress: formData.get("emailAddress") as string,
      country: formData.get("country") as string,
      streetAddress: formData.get("streetAddress") as string,
      city: formData.get("city") as string,
      region: formData.get("region") as string,
      postCode: formData.get("postCode") as string,
      wasteManagementMethod: formData.get("wasteManagementMethod") as string,
      servicesOffered: formData.get("servicesOffered") as string,
      wasteType: formData.get("wasteType") as string,
      environmentalPolicy: formData.get("environmentalPolicy") as string,
      certifications: [
        ...(profileData.certifications
          ? profileData.certifications.split(",")
          : []),
        ...certificationNames,
      ],
    });

    alert("Profile saved successfully!");
    router.push("/home/my-activity");
  };

  /* =========================================================
     UI
  ========================================================= */

  return (
    <main>
      <form
        className="flex flex-col p-8 rounded-xl space-y-5"
        onSubmit={handleSubmit}
      >
        {/* PROFILE IMAGE */}

        <div className="grid grid-cols-1 justify-items-center ">
          <div className="mb-2 text-sm text-gray-800">
            <h1 className="pb-2 font-semibold">Profile Picture:</h1>
          </div>

          {profileData.profilePicture && (
            <div className="mb-4">
              <img
                src={getImageUrl(profileData.profilePicture)}
                alt="Profile"
                className="rounded-full mb-2 h-32 w-32 object-cover"
              />
            </div>
          )}

          <input
            type="file"
            name="profilePicture"
            onChange={handleFileChange}
            className="mt-2 ml-32"
          />
        </div>

        {/* COMPANY OVERVIEW */}

        <section>
          <h1 className="pb-2 font-semibold">Company Overview :</h1>

          <label className="block text-sm font-medium text-gray-700 mt-4">
            Company Name
          </label>

          <input
            required
            className="w-full border rounded-md mt-2 px-3 py-2 text-sm"
            name="companyName"
            defaultValue={profileData.companyName || ""}
          />

          <label className="block text-sm font-medium text-gray-700 mt-4">
            Company Overview
          </label>

          <textarea
            required
            className="w-full border rounded-md mt-2 px-3 py-2 text-sm min-h-24"
            name="companyOverview"
            defaultValue={profileData.companyOverview || ""}
          />
        </section>

        {/* CONTACT INFO */}

        <section>
          <h1 className="pb-2 font-semibold">Contact Information:</h1>

          <div className="grid grid-cols-3 gap-4 ">
            <div>
              <label className="block text-sm font-medium text-gray-700 mt-4">
                Telephone
              </label>

              <input
                required
                className="w-full border rounded-md mt-2 px-3 py-2 text-sm"
                name="telephone"
                defaultValue={profileData.telephone || ""}
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mt-4">
                Email Address
              </label>

              <input
                required
                className="w-full border rounded-md mt-2 px-3 py-2 text-sm"
                name="emailAddress"
                defaultValue={profileData.emailAddress || ""}
              />
            </div>
          </div>

          {/* ADDRESS */}

          <section className="my-10">
            <h1 className="pb-2 font-semibold">Physical Address:</h1>

            <input
              required
              className="w-full border rounded-md mt-2 px-3 py-2 text-sm"
              name="streetAddress"
              defaultValue={profileData.streetAddress || ""}
            />

            <div className="grid grid-cols-3 gap-4">
              <input
                required
                className="border rounded-md mt-2 px-3 py-2 text-sm"
                name="postCode"
                defaultValue={profileData.postCode || ""}
              />

              <input
                required
                className="border rounded-md mt-2 px-3 py-2 text-sm"
                name="city"
                defaultValue={profileData.city || ""}
              />

              <input
                required
                className="border rounded-md mt-2 px-3 py-2 text-sm"
                name="region"
                defaultValue={profileData.region || ""}
              />
            </div>

            <input
              required
              className="w-full border rounded-md mt-2 px-3 py-2 text-sm"
              name="country"
              defaultValue={profileData.country || ""}
            />
          </section>
        </section>

        {/* SERVICES */}

        <section>
          <h1 className="pb-2 font-semibold">Services Offerings:</h1>

          <input
            required
            className="w-full border rounded-md mt-2 px-3 py-2 text-sm"
            name="wasteManagementMethod"
            defaultValue={profileData.wasteManagementMethod || ""}
          />

          <textarea
            required
            className="w-full border rounded-md mt-2 px-3 py-2 text-sm min-h-24"
            name="servicesOffered"
            defaultValue={profileData.servicesOffered || ""}
          />

          <input
            className="w-full border rounded-md mt-2 px-3 py-2 text-sm"
            name="wasteType"
            defaultValue={profileData.wasteType || ""}
          />
        </section>

        {/* ENVIRONMENT */}

        <section>
          <h1 className="pb-2 font-semibold">Environmental Policy :</h1>

          <textarea
            className="w-full border rounded-md mt-2 px-3 py-2 text-sm min-h-24"
            name="environmentalPolicy"
            defaultValue={profileData.environmentalPolicy || ""}
          />

          {/* EXISTING CERTS */}

          {profileData.certifications && (
            <ul className="list-disc list-inside mt-2">
              {profileData.certifications.split(",").map((cert, index) => (
                <li key={index}>
                  <a
                    href={getImageUrl(cert)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 underline"
                  >
                    {cert}
                  </a>
                </li>
              ))}
            </ul>
          )}

          {/* NEW CERTS */}

          <input
            type="file"
            name="newCertifications"
            multiple
            onChange={handleFileChange}
            className="mt-2"
          />

          {newCertifications.length > 0 && (
            <ul className="mt-2">
              {newCertifications.map((file, index) => (
                <li key={index}>{file.name}</li>
              ))}
            </ul>
          )}
        </section>

        <button
          className="bg-blue-600 text-white py-2 px-4 rounded-md self-end"
          type="submit"
        >
          Save Profile
        </button>
      </form>
    </main>
  );
}
