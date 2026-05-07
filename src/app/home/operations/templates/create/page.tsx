"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { createTemplateAction } from "@/modules/templates/actions/templateActions";

/* =========================================================
   TYPES
========================================================= */

type Message = {
  type: "success" | "error";
  text: string;
};

/* =========================================================
   PAGE
========================================================= */

export default function CreateTemplatePage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const isDisabled = loading || !name.trim();

  async function handleCreate() {
    if (loading) return;

    setMessage(null);

    if (!name.trim()) {
      setMessage({
        type: "error",
        text: "Template name is required.",
      });
      return;
    }

    setLoading(true);

    try {
      /*
        Your existing createTemplateAction currently appears to accept only name
        and returns the raw template object.

        If you later update the action to accept description too, change this to:
        createTemplateAction({ name, description })
      */
      const template = await createTemplateAction(name.trim());

      if (!template?.id) {
        throw new Error("Failed to create template.");
      }

      setMessage({
        type: "success",
        text: "Template created successfully. Opening template builder...",
      });

      setTimeout(() => {
        router.push(`/home/operations/templates/${template.id}`);
      }, 500);
    } catch (err: any) {
      console.error("Create template error:", err);

      setMessage({
        type: "error",
        text:
          err?.message ||
          "Something went wrong while creating the template. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f3ed] pl-[24vw] px-10 py-32">
      <div className="max-w-5xl space-y-8">
        {/* BACK */}
        <Link
          href="/home/operations/templates"
          className="text-sm font-medium text-black/45 transition hover:text-orange-600"
        >
          ← Back to template library
        </Link>

        {/* HEADER */}
        <section className="rounded-3xl border border-black/10 bg-black p-8 text-white shadow-sm">
          <p className="text-xs uppercase tracking-[0.25em] text-orange-400">
            Waste X Templates
          </p>

          <h1 className="mt-3 text-3xl font-semibold">
            Create Listing Template
          </h1>

          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
            Create a reusable template for structured waste listing data.
            Templates help your organisation keep listings consistent,
            audit-ready and aligned with operational requirements.
          </p>
        </section>

        {/* GRID */}
        <div className="grid grid-cols-1 gap-8 xl:grid-cols-6">
          {/* FORM */}
          <section className="xl:col-span-4">
            <div className="rounded-3xl border border-black/10 bg-white p-8 shadow-sm">
              <div className="mb-8">
                <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
                  Template Setup
                </p>

                <h2 className="mt-2 text-xl font-semibold text-black">
                  Basic Template Details
                </h2>

                <p className="mt-2 text-sm leading-6 text-black/45">
                  Start with a clear template name. After creation, you’ll be
                  taken into the template builder where sections and fields can
                  be added.
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

              <div className="space-y-6">
                {/* NAME */}
                <div>
                  <label className="text-sm font-medium text-black">
                    Template Name <span className="text-orange-600">*</span>
                  </label>

                  <p className="mt-1 text-xs text-black/40">
                    Use a name your team will recognise when creating waste
                    listings.
                  </p>

                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Example: Construction Waste Collection"
                    className="mt-3 w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm text-black outline-none transition placeholder:text-black/30 focus:border-orange-500 focus:bg-white"
                  />
                </div>

                {/* DESCRIPTION */}
                <div>
                  <label className="text-sm font-medium text-black">
                    Description
                  </label>

                  <p className="mt-1 text-xs text-black/40">
                    Optional for now. This is kept locally on this page until
                    the create action supports saving descriptions.
                  </p>

                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Describe what this template should be used for..."
                    rows={4}
                    className="mt-3 w-full resize-none rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm text-black outline-none transition placeholder:text-black/30 focus:border-orange-500 focus:bg-white"
                  />
                </div>

                {/* ACTIONS */}
                <div className="flex items-center justify-between gap-4 border-t border-black/5 pt-6">
                  <div className="text-xs text-black/40">
                    You can add sections, fields and required data rules after
                    creating the template.
                  </div>

                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={isDisabled}
                    className={`rounded-full px-6 py-3 text-sm font-semibold transition ${
                      isDisabled
                        ? "cursor-not-allowed bg-black/20 text-black/40"
                        : "bg-orange-500 text-black hover:bg-orange-400"
                    }`}
                  >
                    {loading ? "Creating..." : "Create Template"}
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* RIGHT PANEL */}
          <aside className="xl:col-span-2 space-y-6">
            <GuidanceCard
              label="Step 01"
              title="Create Template"
              text="Create the base template record. This stores ownership, versioning and active state."
            />

            <GuidanceCard
              label="Step 02"
              title="Add Sections"
              text="Break the template into operational sections such as waste details, collection site, hazards, documents or pricing."
            />

            <GuidanceCard
              label="Step 03"
              title="Add Fields"
              text="Add structured fields so listings capture consistent data every time they are created."
            />

            <GuidanceCard
              label="Compliance Note"
              title="Keep it structured"
              text="Avoid free-text-only templates. Structured fields make audit exports, verification and reporting much stronger."
              highlighted
            />
          </aside>
        </div>
      </div>
    </main>
  );
}

/* =========================================================
   SMALL COMPONENTS
========================================================= */

function GuidanceCard({
  label,
  title,
  text,
  highlighted = false,
}: {
  label: string;
  title: string;
  text: string;
  highlighted?: boolean;
}) {
  return (
    <div
      className={`rounded-3xl border p-6 shadow-sm ${
        highlighted
          ? "border-orange-300 bg-orange-50"
          : "border-black/10 bg-white"
      }`}
    >
      <p
        className={`text-xs uppercase tracking-[0.25em] ${
          highlighted ? "text-orange-700" : "text-orange-600"
        }`}
      >
        {label}
      </p>

      <h3 className="mt-3 text-base font-semibold text-black">{title}</h3>

      <p className="mt-2 text-sm leading-6 text-black/50">{text}</p>
    </div>
  );
}
