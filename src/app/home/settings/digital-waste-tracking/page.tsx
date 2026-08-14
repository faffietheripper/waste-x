// src/app/home/settings/digital-waste-tracking/page.tsx

import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";
import { users } from "@/db/schema";

import { getWasteTrackingOrganisationSettings } from "@/modules/digital-waste-tracking/data-access/getWasteTrackingOrganisationSettings";

import {
  type Capability,
  type DepartmentType,
  hasOperationalPermissionForOrganisation,
} from "@/modules/auth/core/permissions";

import DigitalWasteTrackingSettingsForm from "./DigitalWasteTrackingSettingsForm";

/* =========================================================
   HELPERS
========================================================= */

function canManageDwtSettings(role: string | null | undefined) {
  return (
    role === "administrator" ||
    role === "seniorManagement" ||
    role === "platform_admin"
  );
}

function formatDepartment(type: string | null | undefined) {
  if (!type) return "Solo workspace";

  if (type === "generator") return "Generator";
  if (type === "carrier") return "Carrier";
  if (type === "manager") return "Waste Manager";
  if (type === "compliance") return "Compliance";

  return type;
}

function StatusBadge({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] ${
        enabled
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-orange-200 bg-orange-50 text-orange-700"
      }`}
    >
      {enabled ? "Enabled" : "Disabled"}
    </span>
  );
}

/* =========================================================
   PAGE
========================================================= */

export default async function DigitalWasteTrackingSettingsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const currentUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    with: {
      organisation: true,
      department: true,
    },
  });

  if (!currentUser?.organisationId || !currentUser.organisation) {
    redirect("/home/settings/organisation?reason=no-organisation");
  }

  const capabilities =
    (currentUser.organisation.capabilities as Capability[] | null) ?? [];

  const departmentType =
    (currentUser.department?.type as DepartmentType | undefined) ?? null;

  const isSoloOrganisation = currentUser.organisation.operatingMode === "solo";

const canViewDwt = hasOperationalPermissionForOrganisation({
  capabilities,
  departmentType,
  permission: "dwt:view",
  operatingMode: currentUser.organisation.operatingMode,
});

const canSubmitDwt = hasOperationalPermissionForOrganisation({
  capabilities,
  departmentType,
  permission: "dwt:submit_receive_movement",
  operatingMode: currentUser.organisation.operatingMode,
});

  const canEdit = canManageDwtSettings(currentUser.role);

  const settings = await getWasteTrackingOrganisationSettings({
    organisationId: currentUser.organisationId,
  });

  const isConfigured = Boolean(settings?.apiCode);
  const isEnabled = Boolean(settings?.isEnabled);

  return (
    <main className="min-h-screen bg-[#f7f3ed] text-black">
      {/* ================= HEADER ================= */}
      <section className="rounded-[2rem] bg-black p-8 text-white shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-orange-400">
              Settings
            </p>

            <h1 className="mt-4 text-4xl font-semibold tracking-tight">
              Digital Waste Tracking
            </h1>

            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
              Save the Receiver API Code for this organisation so users do not
              need to enter it manually on every receive movement submission.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/home/compliance/digital-waste-tracking"
              className="inline-flex rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
            >
              DWT dashboard
            </Link>

            <Link
              href="/home/receiving/intake"
              className="inline-flex rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
            >
              Intake queue →
            </Link>
          </div>
        </div>
      </section>

      {/* ================= STATUS CARDS ================= */}
      <section className="mt-8 grid gap-4 md:grid-cols-4">
        <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-black/40">DWT status</p>
          <div className="mt-4">
            <StatusBadge enabled={isEnabled} />
          </div>
        </div>

        <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-black/40">Receiver code</p>
          <p
            className={`mt-3 text-2xl font-semibold ${
              isConfigured ? "text-emerald-700" : "text-orange-700"
            }`}
          >
            {isConfigured ? "Configured" : "Missing"}
          </p>
        </div>

        <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-black/40">Environment</p>
          <p className="mt-3 text-2xl font-semibold capitalize text-black">
            {settings?.environment ?? "test"}
          </p>
        </div>

        <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-black/40">Your access</p>
          <p className="mt-3 text-2xl font-semibold text-black">
            {canEdit ? "Can edit" : "View only"}
          </p>
        </div>
      </section>

      {/* ================= SOLO NOTICE ================= */}
      {isSoloOrganisation && (
        <section className="mt-8 rounded-3xl border border-orange-200 bg-orange-50 p-5 text-orange-800">
          <p className="text-sm font-semibold">Solo workspace mode</p>

          <p className="mt-2 max-w-4xl text-sm leading-6">
            This organisation is running in solo mode, so Digital Waste Tracking
            settings are managed without requiring an active department. Waste X
            will treat the solo user as the effective compliance/manager
            operator for DWT workflows.
          </p>
        </section>
      )}

      {/* ================= EXPLANATION ================= */}
      <section className="mt-8 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-6">
          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-600">
              What this code is
            </p>

            <h2 className="mt-2 text-xl font-semibold text-black">
              Receiver API Code
            </h2>

            <p className="mt-3 text-sm leading-6 text-black/55">
              The Receiver API Code identifies the waste receiver/operator that
              is reporting the received waste. It is not the same as the Defra
              client ID or client secret.
            </p>

            <div className="mt-5 rounded-3xl border border-black/10 bg-[#f7f3ed] p-5 text-sm leading-6 text-black/55">
              <p>
                <span className="font-semibold text-black">
                  Client ID + Client Secret:
                </span>{" "}
                Waste X software credentials. Stored securely on the server.
              </p>

              <p className="mt-3">
                <span className="font-semibold text-black">
                  Receiver API Code:
                </span>{" "}
                Receiver/operator code. Stored against this organisation and
                used in the receive movement payload.
              </p>
            </div>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-600">
              Current user context
            </p>

            <div className="mt-4 space-y-3 text-sm text-black/55">
              <p>
                <span className="font-semibold text-black">Organisation:</span>{" "}
                {currentUser.organisation.teamName}
              </p>

              <p>
                <span className="font-semibold text-black">Role:</span>{" "}
                {currentUser.role}
              </p>

              <p>
                <span className="font-semibold text-black">Workspace mode:</span>{" "}
                {currentUser.organisation.operatingMode ?? "team"}
              </p>

              <p>
                <span className="font-semibold text-black">Department:</span>{" "}
                {currentUser.department?.name ?? "Solo workspace"} (
                {formatDepartment(currentUser.department?.type)})
              </p>

              <p>
                <span className="font-semibold text-black">Can view DWT:</span>{" "}
                {canViewDwt ? "Yes" : "No"}
              </p>

              <p>
                <span className="font-semibold text-black">
                  Can submit DWT:
                </span>{" "}
                {canSubmitDwt ? "Yes" : "No"}
              </p>

              <p>
                <span className="font-semibold text-black">Capabilities:</span>{" "}
                {capabilities.length > 0
                  ? capabilities.join(", ")
                  : isSoloOrganisation
                    ? "solo effective workflow"
                    : "none recorded"}
              </p>
            </div>
          </div>
        </div>

        <DigitalWasteTrackingSettingsForm
          canEdit={canEdit}
          initialSettings={{
            apiCode: settings?.apiCode ?? "",
            environment: settings?.environment ?? "test",
            isEnabled: settings?.isEnabled ?? false,
          }}
        />
      </section>
    </main>
  );
}