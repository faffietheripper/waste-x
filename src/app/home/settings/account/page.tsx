import ConfirmProfileDelete from "@/components/app/ConfirmProfileDelete";
import UserOverview from "@/components/app/MyActivity/UserOverview";
import ManagePassword from "@/components/ManagePassword";
import React from "react";

/* =========================================================
   PAGE
========================================================= */

export default function AccountSettingsPage() {
  return (
    <div className="space-y-8">
      {/* HEADER */}
      <section className="rounded-3xl border border-black/10 bg-black p-8 text-white shadow-sm">
        <p className="text-xs uppercase tracking-[0.25em] text-orange-400">
          Waste X Account
        </p>

        <h1 className="mt-3 text-3xl font-semibold">Account Settings</h1>

        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
          Manage your account access, password, identity overview and account
          removal controls. These settings affect your Waste X login and user
          access across operational workflows.
        </p>
      </section>

      {/* ACCOUNT OVERVIEW */}
      <section className="rounded-3xl border border-black/10 bg-white p-8 shadow-sm">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
            User Overview
          </p>

          <h2 className="mt-2 text-xl font-semibold text-black">
            Account Summary
          </h2>

          <p className="mt-2 text-sm leading-6 text-black/45">
            Review your account details, profile state and current Waste X
            access context.
          </p>
        </div>

        <UserOverview />
      </section>

      {/* ACCOUNT CONTROLS */}
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* PASSWORD */}
        <AccountPanel
          eyebrow="Security"
          title="Manage Password"
          description="Update your password and keep your account access secure."
          tone="default"
        >
          <ManagePassword />
        </AccountPanel>

        {/* DELETE */}
        <AccountPanel
          eyebrow="Danger Zone"
          title="Delete Account"
          description="Permanently remove your account. This action should only be used when you are sure you no longer need access."
          tone="danger"
          defaultOpen={false}
        >
          <div className="space-y-4">
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm leading-6 text-red-800">
              <p className="font-semibold">Permanent account deletion</p>

              <p className="mt-2">
                Deleting your account means you may not be able to recover your
                historical account data if you decide to use the service again.
                Any operational records already created may still remain where
                required for audit, compliance or organisation history.
              </p>
            </div>

            <ConfirmProfileDelete />
          </div>
        </AccountPanel>
      </section>

      {/* GUIDANCE */}
      <section className="rounded-3xl border border-black/10 bg-white p-8 shadow-sm">
        <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
          Account Guidance
        </p>

        <h2 className="mt-2 text-xl font-semibold text-black">
          Before changing account settings
        </h2>

        <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-3">
          <GuidanceCard
            title="Password security"
            text="Use a strong password and update it if you think your account access may have been exposed."
          />

          <GuidanceCard
            title="Operational records"
            text="Waste X records may be tied to your user identity for compliance, audit and chain-of-custody history."
          />

          <GuidanceCard
            title="Organisation access"
            text="If you are leaving a company, removing organisation access may be better than deleting the whole account."
          />
        </div>
      </section>
    </div>
  );
}

/* =========================================================
   ACCOUNT PANEL
========================================================= */

function AccountPanel({
  eyebrow,
  title,
  description,
  children,
  tone = "default",
  defaultOpen = false,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
  tone?: "default" | "danger";
  defaultOpen?: boolean;
}) {
  const isDanger = tone === "danger";

  return (
    <details
      open={defaultOpen}
      className={`group rounded-3xl border p-6 shadow-sm [&_summary::-webkit-details-marker]:hidden ${
        isDanger ? "border-red-200 bg-red-50" : "border-black/10 bg-white"
      }`}
    >
      <summary className="flex cursor-pointer items-start justify-between gap-5">
        <div>
          <p
            className={`text-xs uppercase tracking-[0.25em] ${
              isDanger ? "text-red-600" : "text-orange-600"
            }`}
          >
            {eyebrow}
          </p>

          <h2 className="mt-2 text-xl font-semibold text-black">{title}</h2>

          <p
            className={`mt-2 max-w-xl text-sm leading-6 ${
              isDanger ? "text-red-800/70" : "text-black/45"
            }`}
          >
            {description}
          </p>
        </div>

        <span
          className={`grid size-10 shrink-0 place-items-center rounded-full border transition ${
            isDanger
              ? "border-red-200 bg-white text-red-700"
              : "border-black/10 bg-[#fbfaf7] text-black/55 group-hover:border-orange-300 group-hover:text-orange-600"
          }`}
        >
          <PlusIcon />
        </span>
      </summary>

      <div
        className={`mt-6 border-t pt-6 ${
          isDanger ? "border-red-200" : "border-black/5"
        }`}
      >
        {children}
      </div>
    </details>
  );
}

/* =========================================================
   GUIDANCE CARD
========================================================= */

function GuidanceCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-[#fbfaf7] p-5">
      <p className="text-sm font-semibold text-black">{title}</p>
      <p className="mt-2 text-sm leading-6 text-black/45">{text}</p>
    </div>
  );
}

/* =========================================================
   ICON
========================================================= */

function PlusIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="size-5 transition group-open:rotate-45"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth="1.8"
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" />
    </svg>
  );
}
