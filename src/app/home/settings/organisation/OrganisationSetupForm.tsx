"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  FiAlertTriangle,
  FiBriefcase,
  FiCheckCircle,
  FiLoader,
} from "react-icons/fi";

import {
  createOrganisationAction,
  fetchOrganisationAction,
} from "@/modules/organisations/actions/createOrganisationAction";

type Capability = "generator" | "carrier" | "manager";

interface OrganisationData {
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
  status?: string | null;
}

const capabilityOptions: {
  label: string;
  value: Capability;
  description: string;
}[] = [
  {
    label: "Waste Generator",
    value: "generator",
    description:
      "Your organisation produces waste and needs to assign it for collection or treatment.",
  },
  {
    label: "Waste Carrier",
    value: "carrier",
    description:
      "Your organisation transports, collects or handles waste movements.",
  },
  {
    label: "Waste Manager",
    value: "manager",
    description:
      "Your organisation manages compliance, brokerage, oversight or waste operations.",
  },
];

export default function OrganisationSetupForm() {
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");

  const [profileData, setProfileData] = useState<OrganisationData>({});
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<React.ReactNode | null>(null);

  useEffect(() => {
    const loadOrganisation = async () => {
      try {
        const organisation = await fetchOrganisationAction();

        if (organisation) {
          setProfileData(organisation as OrganisationData);

          if ((organisation as OrganisationData).capabilities?.length) {
            setCapabilities(
              (organisation as OrganisationData).capabilities as Capability[],
            );
          }
        }
      } catch (err) {
        console.error("Failed to load organisation:", err);
      } finally {
        setLoadingProfile(false);
      }
    };

    loadOrganisation();
  }, []);

  const toggleCapability = (value: Capability) => {
    setCapabilities((prev) =>
      prev.includes(value)
        ? prev.filter((capability) => capability !== value)
        : [...prev, value],
    );
  };

  const mapError = (err: any): React.ReactNode => {
    const code = err?.code || err?.message;

    switch (code) {
      case "USER_ALREADY_HAS_ORGANISATION":
        return "Your account is already linked to an organisation.";

      case "NO_CAPABILITIES":
        return "Select at least one organisation capability.";

      case "INVALID_INPUT":
        return "Please check the organisation details and try again.";

      case "UNAUTHORIZED":
        return "Session expired. Please log in again.";

      default:
        return "Something went wrong. Please try again.";
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setLoading(true);
    setError(null);
    setSuccess(null);

    if (capabilities.length === 0) {
      setError("Select at least one capability.");
      setLoading(false);
      return;
    }

    const formData = new FormData(e.currentTarget);

    formData.delete("capabilities");
    capabilities.forEach((capability) => {
      formData.append("capabilities", capability);
    });

    try {
      await createOrganisationAction(formData);
      setSuccess("Organisation submitted for approval.");
    } catch (err: any) {
      console.error(err);
      setError(mapError(err));
    } finally {
      setLoading(false);
    }
  };

  const alreadySubmitted =
    profileData.status === "PENDING" ||
    profileData.status === "ACTIVE" ||
    profileData.status === "REJECTED";

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-8 py-32">
      <div className="mx-auto max-w-5xl space-y-8">
        <section className="rounded-3xl border border-black/10 bg-black p-8 text-white shadow-sm">
          <div className="flex items-start gap-5">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-orange-500 text-2xl text-black">
              <FiBriefcase />
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-orange-400">
                Waste X Organisation Setup
              </p>

              <h1 className="mt-3 text-3xl font-semibold">
                Create your organisation
              </h1>

              <p className="mt-3 max-w-2xl text-sm text-white/55">
                Tell us what your organisation does in the waste chain. Your
                account will be submitted for platform approval before your team
                can operate inside Waste X.
              </p>
            </div>
          </div>
        </section>

        {reason === "no-organisation" && (
          <div className="flex gap-3 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
            <FiAlertTriangle className="mt-0.5 shrink-0" />
            <span>
              No organisation is linked to your account. Create one below to
              continue.
            </span>
          </div>
        )}

        {error && (
          <div className="flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <FiAlertTriangle className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="flex gap-3 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
            <FiCheckCircle className="mt-0.5 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {loadingProfile ? (
          <div className="rounded-3xl border border-black/10 bg-white p-10 text-sm text-black/50">
            Loading organisation details...
          </div>
        ) : alreadySubmitted ? (
          <SubmittedState organisation={profileData} />
        ) : (
          <form
            onSubmit={handleSubmit}
            className="rounded-3xl border border-black/10 bg-white p-8 shadow-sm"
          >
            <div className="grid grid-cols-6 gap-6">
              <section className="col-span-6">
                <h2 className="text-lg font-semibold text-black">
                  Organisation Capabilities
                </h2>

                <p className="mt-1 text-sm text-black/50">
                  Select all operational roles your organisation performs. This
                  helps Waste X configure your account correctly after approval.
                </p>

                <div className="mt-5 grid gap-4 md:grid-cols-3">
                  {capabilityOptions.map((item) => {
                    const selected = capabilities.includes(item.value);

                    return (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => toggleCapability(item.value)}
                        className={`rounded-2xl border p-5 text-left transition ${
                          selected
                            ? "border-orange-500 bg-orange-50"
                            : "border-black/10 bg-[#fbfaf7] hover:border-orange-300"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-black">
                              {item.label}
                            </p>
                            <p className="mt-2 text-xs leading-relaxed text-black/50">
                              {item.description}
                            </p>
                          </div>

                          <span
                            className={`mt-1 h-4 w-4 rounded-full border ${
                              selected
                                ? "border-orange-500 bg-orange-500"
                                : "border-black/20 bg-white"
                            }`}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="col-span-6 mt-4">
                <h2 className="text-lg font-semibold text-black">
                  Organisation Details
                </h2>

                <p className="mt-1 text-sm text-black/50">
                  These details will be used for verification and audit records.
                </p>
              </section>

              <Input
                name="teamName"
                label="Organisation Name"
                placeholder="e.g. Norfolk Waste Services"
                defaultValue={profileData.teamName}
                className="col-span-6 md:col-span-4"
              />

              <Input
                name="industry"
                label="Industry"
                placeholder="e.g. Construction, demolition, logistics"
                defaultValue={profileData.industry}
                className="col-span-6 md:col-span-2"
              />

              <Input
                name="telephone"
                label="Telephone"
                placeholder="Business telephone"
                defaultValue={profileData.telephone}
                className="col-span-6 md:col-span-2"
              />

              <Input
                name="emailAddress"
                label="Email Address"
                placeholder="Business email"
                type="email"
                defaultValue={profileData.emailAddress}
                className="col-span-6 md:col-span-4"
              />

              <Input
                name="streetAddress"
                label="Street Address"
                placeholder="Registered or operating address"
                defaultValue={profileData.streetAddress}
                className="col-span-6"
              />

              <Input
                name="postCode"
                label="Post Code"
                placeholder="Post code"
                defaultValue={profileData.postCode}
                className="col-span-6 md:col-span-2"
              />

              <Input
                name="city"
                label="City"
                placeholder="City"
                defaultValue={profileData.city}
                className="col-span-6 md:col-span-2"
              />

              <Input
                name="region"
                label="Region"
                placeholder="County / region"
                defaultValue={profileData.region}
                className="col-span-6 md:col-span-2"
              />

              <Input
                name="country"
                label="Country"
                placeholder="Country"
                defaultValue={profileData.country}
                className="col-span-6"
              />

              <div className="col-span-6 mt-4 flex items-center justify-between gap-4 border-t border-black/10 pt-6">
                <p className="max-w-xl text-xs text-black/45">
                  Once submitted, your organisation will be reviewed by the
                  Waste X platform team. Departments are created automatically
                  after approval.
                </p>

                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-2 rounded-full bg-orange-500 px-6 py-3 text-sm font-semibold text-black transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading && <FiLoader className="animate-spin" />}
                  {loading ? "Submitting..." : "Submit for Approval"}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}

function Input({
  name,
  label,
  placeholder,
  defaultValue,
  type = "text",
  className = "",
}: {
  name: string;
  label: string;
  placeholder: string;
  defaultValue?: string | null;
  type?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="text-sm font-medium text-black/70">{label}</label>
      <input
        required
        name={name}
        type={type}
        placeholder={placeholder}
        defaultValue={defaultValue || ""}
        className="mt-2 w-full rounded-xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm text-black outline-none transition focus:border-orange-500 focus:bg-white"
      />
    </div>
  );
}

function SubmittedState({ organisation }: { organisation: OrganisationData }) {
  const isPending = organisation.status === "PENDING";
  const isActive = organisation.status === "ACTIVE";
  const isRejected = organisation.status === "REJECTED";

  return (
    <div className="rounded-3xl border border-black/10 bg-white p-8 shadow-sm">
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-orange-500">
            Organisation Status
          </p>

          <h2 className="mt-3 text-2xl font-semibold text-black">
            {organisation.teamName}
          </h2>

          <p className="mt-2 text-sm text-black/50">
            Your organisation profile has already been submitted.
          </p>
        </div>

        <span
          className={`rounded-full px-4 py-2 text-sm font-semibold ${
            isPending
              ? "bg-orange-100 text-orange-700"
              : isActive
                ? "bg-green-100 text-green-700"
                : isRejected
                  ? "bg-red-100 text-red-700"
                  : "bg-black/5 text-black/60"
          }`}
        >
          {organisation.status}
        </span>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <Info label="Industry" value={organisation.industry} />
        <Info label="Email" value={organisation.emailAddress} />
        <Info label="Telephone" value={organisation.telephone} />
      </div>

      <div className="mt-6">
        <p className="text-xs uppercase tracking-widest text-black/40">
          Capabilities
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {organisation.capabilities?.map((capability) => (
            <span
              key={capability}
              className="rounded-full border border-black/10 bg-[#fbfaf7] px-3 py-1 text-xs font-medium capitalize text-black/70"
            >
              {capability}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-black/10 bg-[#fbfaf7] p-5 text-sm text-black/55">
        {isPending &&
          "Your organisation is waiting for platform approval. Once approved, Waste X will automatically create your default departments and assign the first administrator to Compliance."}

        {isActive &&
          "Your organisation is active. You can now invite team members and assign them to departments."}

        {isRejected &&
          "Your organisation request was rejected. Contact Waste X support for next steps."}
      </div>

      {isActive && (
        <div className="mt-6">
          <Link
            href="/home/team/members"
            className="inline-flex rounded-full bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-black/80"
          >
            Manage Team Members
          </Link>
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-[#fbfaf7] p-4">
      <p className="text-xs uppercase tracking-widest text-black/40">{label}</p>
      <p className="mt-2 text-sm font-medium text-black">
        {value || "Not provided"}
      </p>
    </div>
  );
}
