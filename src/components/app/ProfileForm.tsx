"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  createUploadUrlAction,
  saveProfileAction,
  fetchProfileAction,
} from "@/app/home/settings/actions";

import { getImageUrl } from "@/util/files";
import { useToast } from "@/components/ui/use-toast";

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

type Message = {
  type: "success" | "error";
  text: string;
};

/* =========================================================
   COMPONENT
========================================================= */

export default function ProfileForm() {
  const { toast } = useToast();
  const router = useRouter();

  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [newProfilePicture, setNewProfilePicture] = useState<File | null>(null);
  const [message, setMessage] = useState<Message | null>(null);

  /* =========================================================
     LOAD PROFILE
  ========================================================= */

  useEffect(() => {
    async function loadProfile() {
      try {
        const profile = await fetchProfileAction();
        setProfileData(profile);
      } catch (error) {
        console.error("Load profile error:", error);

        toast({
          title: "Error",
          description: "Failed to load profile.",
          variant: "destructive",
        });

        setMessage({
          type: "error",
          text: "Failed to load your profile details.",
        });
      } finally {
        setIsLoading(false);
      }
    }

    loadProfile();
  }, [toast]);

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

    if (submitting) return;

    setSubmitting(true);
    setMessage(null);

    const form = e.currentTarget;
    const formData = new FormData(form);

    let uploadedFileName = profileData?.profilePicture || "";

    try {
      /* ===============================
         UPLOAD PROFILE IMAGE
      ============================== */

      if (newProfilePicture) {
        const uniqueKey = `${crypto.randomUUID()}-${newProfilePicture.name}`;

        const urls = await createUploadUrlAction(
          [uniqueKey],
          [newProfilePicture.type],
        );

        const signedUrl = urls[0];

        if (!signedUrl) {
          throw new Error("Failed to generate upload URL.");
        }

        await fetch(signedUrl, {
          method: "PUT",
          body: newProfilePicture,
        });

        uploadedFileName = uniqueKey;
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

      setMessage({
        type: "success",
        text: "Your profile has been saved successfully.",
      });

      toast({
        title: "Profile updated",
        description: "Your profile has been saved successfully.",
      });

      router.refresh();
    } catch (error) {
      console.error("Save profile error:", error);

      setMessage({
        type: "error",
        text: "Failed to update profile. Please check the details and try again.",
      });

      toast({
        title: "Error",
        description: "Failed to update profile.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  /* =========================================================
     LOADING STATE
  ========================================================= */

  if (isLoading) {
    return (
      <section className="rounded-3xl border border-black/10 bg-white p-8 shadow-sm">
        <div className="animate-pulse space-y-5">
          <div className="h-5 w-40 rounded bg-black/10" />
          <div className="h-12 rounded-2xl bg-black/10" />
          <div className="h-12 rounded-2xl bg-black/10" />
          <div className="h-12 rounded-2xl bg-black/10" />
        </div>
      </section>
    );
  }

  /* =========================================================
     UI
  ========================================================= */

  return (
    <section className="grid grid-cols-1 gap-8 xl:grid-cols-12">
      {/* LEFT PANEL */}
      <aside className="xl:col-span-4">
        <div className="sticky top-[35vh] rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
          <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
            Profile Identity
          </p>

          <h2 className="mt-2 text-xl font-semibold text-black">
            Your Waste X profile
          </h2>

          <p className="mt-2 text-sm leading-6 text-black/45">
            This profile is used in operational records, assignment activity,
            incident reports and compliance audit trails.
          </p>

          <div className="mt-6 rounded-3xl border border-black/10 bg-[#fbfaf7] p-6 text-center">
            {profileData?.profilePicture ? (
              <img
                src={getImageUrl(profileData.profilePicture)}
                alt="Profile"
                className="mx-auto h-32 w-32 rounded-full border border-black/10 object-cover"
              />
            ) : (
              <div className="mx-auto grid h-32 w-32 place-items-center rounded-full border border-black/10 bg-black text-3xl font-semibold text-orange-400">
                {(profileData?.fullName?.[0] || "W").toUpperCase()}
              </div>
            )}

            <p className="mt-4 text-base font-semibold text-black">
              {profileData?.fullName || "Unnamed User"}
            </p>

            <p className="mt-1 text-sm text-black/45">
              {profileData?.emailAddress || "No email saved"}
            </p>
          </div>

          <div className="mt-6 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm leading-6 text-orange-800">
            Keep these details accurate. Compliance and audit records should
            always point back to a real, identifiable user.
          </div>
        </div>
      </aside>

      {/* FORM */}
      <section className="xl:col-span-8">
        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-black/10 bg-white p-8 shadow-sm"
        >
          <div className="mb-8">
            <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
              Personal Details
            </p>

            <h2 className="mt-2 text-2xl font-semibold text-black">
              Edit Profile
            </h2>

            <p className="mt-2 text-sm leading-6 text-black/45">
              Update your personal contact and address information. Required
              fields help ensure records are complete across the platform.
            </p>
          </div>

          {message && (
            <div
              className={`mb-6 rounded-2xl border p-4 text-sm ${
                message.type === "success"
                  ? "border-green-200 bg-green-50 text-green-700"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {message.text}
            </div>
          )}

          <div className="space-y-8">
            {/* PROFILE IMAGE */}
            <div className="rounded-3xl border border-black/10 bg-[#fbfaf7] p-6">
              <label className="text-sm font-semibold text-black">
                Profile Picture
              </label>

              <p className="mt-1 text-sm text-black/45">
                Upload a clear profile image. This is optional but useful for
                identifying users in internal workflows.
              </p>

              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="mt-4 block w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black file:mr-4 file:rounded-full file:border-0 file:bg-black file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-orange-500 hover:file:text-black"
              />

              {newProfilePicture && (
                <p className="mt-3 text-xs text-orange-700">
                  Selected: {newProfilePicture.name}
                </p>
              )}
            </div>

            {/* NAME */}
            <div>
              <label className="text-sm font-semibold text-black">
                Full Name <span className="text-orange-600">*</span>
              </label>

              <input
                required
                name="fullName"
                defaultValue={profileData?.fullName || ""}
                placeholder="Full name"
                className="mt-2 w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm text-black outline-none transition placeholder:text-black/30 focus:border-orange-500 focus:bg-white"
              />
            </div>

            {/* CONTACT */}
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div>
                <label className="text-sm font-semibold text-black">
                  Telephone <span className="text-orange-600">*</span>
                </label>

                <input
                  required
                  name="telephone"
                  placeholder="Telephone"
                  defaultValue={profileData?.telephone || ""}
                  className="mt-2 w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm text-black outline-none transition placeholder:text-black/30 focus:border-orange-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-black">
                  Email Address <span className="text-orange-600">*</span>
                </label>

                <input
                  required
                  type="email"
                  name="emailAddress"
                  placeholder="Email address"
                  defaultValue={profileData?.emailAddress || ""}
                  className="mt-2 w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm text-black outline-none transition placeholder:text-black/30 focus:border-orange-500 focus:bg-white"
                />
              </div>
            </div>

            {/* ADDRESS */}
            <div className="space-y-5 rounded-3xl border border-black/10 bg-[#fbfaf7] p-6">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
                  Address
                </p>

                <h3 className="mt-2 text-lg font-semibold text-black">
                  Contact Address
                </h3>
              </div>

              <div>
                <label className="text-sm font-semibold text-black">
                  Street Address <span className="text-orange-600">*</span>
                </label>

                <input
                  required
                  name="streetAddress"
                  placeholder="Street address"
                  defaultValue={profileData?.streetAddress || ""}
                  className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition placeholder:text-black/30 focus:border-orange-500"
                />
              </div>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                <div>
                  <label className="text-sm font-semibold text-black">
                    Post Code <span className="text-orange-600">*</span>
                  </label>

                  <input
                    required
                    name="postCode"
                    placeholder="Post code"
                    defaultValue={profileData?.postCode || ""}
                    className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition placeholder:text-black/30 focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="text-sm font-semibold text-black">
                    City <span className="text-orange-600">*</span>
                  </label>

                  <input
                    required
                    name="city"
                    placeholder="City"
                    defaultValue={profileData?.city || ""}
                    className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition placeholder:text-black/30 focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="text-sm font-semibold text-black">
                    Region <span className="text-orange-600">*</span>
                  </label>

                  <input
                    required
                    name="region"
                    placeholder="Region"
                    defaultValue={profileData?.region || ""}
                    className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition placeholder:text-black/30 focus:border-orange-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-black">
                  Country <span className="text-orange-600">*</span>
                </label>

                <input
                  required
                  name="country"
                  placeholder="Country"
                  defaultValue={profileData?.country || ""}
                  className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition placeholder:text-black/30 focus:border-orange-500"
                />
              </div>
            </div>

            {/* SUBMIT */}
            <div className="flex items-center justify-between gap-5 border-t border-black/5 pt-6">
              <p className="text-xs leading-5 text-black/40">
                Changes are saved to your Waste X user profile and may appear in
                operational records.
              </p>

              <button
                type="submit"
                disabled={submitting}
                className={`rounded-full px-6 py-3 text-sm font-semibold transition ${
                  submitting
                    ? "cursor-not-allowed bg-black/20 text-black/40"
                    : "bg-orange-500 text-black hover:bg-orange-400"
                }`}
              >
                {submitting ? "Saving..." : "Save Profile"}
              </button>
            </div>
          </div>
        </form>
      </section>
    </section>
  );
}
