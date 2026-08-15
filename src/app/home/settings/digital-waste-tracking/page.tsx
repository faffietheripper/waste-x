import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";
import { users } from "@/db/schema";
import { getWasteTrackingOrganisationSettings } from "@/modules/digital-waste-tracking/data-access/getWasteTrackingOrganisationSettings";

import DigitalWasteTrackingSettingsForm from "./DigitalWasteTrackingSettingsForm";
import OwnCarrierDwtSettingsForm from "./OwnCarrierDwtSettingsForm";

function canManageDwtSettings(role: string | null | undefined) {
  return (
    role === "administrator" ||
    role === "seniorManagement" ||
    role === "platform_admin"
  );
}

export default async function DigitalWasteTrackingSettingsPage() {
  const session = await auth();

  if (!session?.user?.id) redirect("/login");

  const currentUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    with: { organisation: true },
  });

  if (!currentUser?.organisationId || !currentUser.organisation) {
    redirect("/home/settings/organisation?reason=no-organisation");
  }

  const settings = await getWasteTrackingOrganisationSettings({
    organisationId: currentUser.organisationId,
  });

  const canEdit = canManageDwtSettings(currentUser.role);

  return (
    <main className="min-h-screen bg-[#f7f3ed] text-black">
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
              Keep the approved Defra Receipt API connection intact, and store
              the carrier defaults Waste X needs when your organisation handles
              transport itself.
            </p>
          </div>

          <Link
            href="/home/dwt"
            className="inline-flex rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
          >
            Open DWT Centre →
          </Link>
        </div>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-4">
        <StatusCard
          label="DWT submissions"
          value={settings?.isEnabled ? "Enabled" : "Disabled"}
        />
        <StatusCard
          label="Receiver API Code"
          value={settings?.apiCode ? "Configured" : "Missing"}
        />
        <StatusCard
          label="Environment"
          value={settings?.environment ?? "test"}
        />
        <StatusCard
          label="Own carrier record"
          value={
            settings?.ownCarrierRegistrationNumber ||
            settings?.ownCarrierReasonForNoRegistrationNumber
              ? "Configured"
              : "Needs review"
          }
        />
      </section>

      <section className="mt-8 rounded-3xl border border-blue-200 bg-blue-50 p-5 text-blue-900">
        <p className="text-sm font-semibold">Approved integration preserved</p>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-blue-800/80">
          Stage 5 does not replace the existing payload builder, validator,
          OAuth flow, PAT scenarios or legacy receiving submission action. The
          new Solo workflow prepares Job Load data for that same Receipt API
          contract.
        </p>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[0.75fr_1.25fr]">
        <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-600">
            Organisation
          </p>
          <h2 className="mt-2 text-xl font-semibold">
            {currentUser.organisation.teamName}
          </h2>
          <div className="mt-5 space-y-3 text-sm text-black/55">
            <p>
              <span className="font-semibold text-black">Workspace:</span>{" "}
              {currentUser.organisation.operatingMode}
            </p>
            <p>
              <span className="font-semibold text-black">Role:</span>{" "}
              {currentUser.role}
            </p>
            <p>
              <span className="font-semibold text-black">Settings access:</span>{" "}
              {canEdit ? "Can edit" : "View only"}
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Existing approved API settings component: intentionally unchanged. */}
          <DigitalWasteTrackingSettingsForm
            canEdit={canEdit}
            initialSettings={{
              apiCode: settings?.apiCode ?? "",
              environment: settings?.environment ?? "test",
              isEnabled: settings?.isEnabled ?? false,
            }}
          />

          <OwnCarrierDwtSettingsForm
            canEdit={canEdit}
            initial={{
              registrationNumber:
                settings?.ownCarrierRegistrationNumber ?? "",
              reasonForNoRegistrationNumber:
                settings?.ownCarrierReasonForNoRegistrationNumber ?? "",
              meansOfTransport:
                settings?.ownCarrierMeansOfTransport ?? "Road",
            }}
          />
        </div>
      </section>
    </main>
  );
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
      <p className="text-xs text-black/40">{label}</p>
      <p className="mt-3 text-xl font-semibold capitalize text-black">{value}</p>
    </div>
  );
}
