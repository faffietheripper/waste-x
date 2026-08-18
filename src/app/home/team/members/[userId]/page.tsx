import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import { database } from "@/db/database";
import { users } from "@/db/schema";
import { requireSoloPermission } from "@/modules/solo-permissions/core/requireSoloPermission";
import { getSoloUserAccess } from "@/modules/solo-permissions/data-access/getSoloUserAccess";

import AccessEditor from "./AccessEditor";

type PageProps = {
  params: { userId: string };
  searchParams?: { success?: string; error?: string };
};

export default async function ManageMemberAccessPage({
  params,
  searchParams,
}: PageProps) {
  const context = await requireSoloPermission("permissions:manage");

  // Fetch by ID first so a tenant mismatch does not look like a fake 404.
  const target = await database.query.users.findFirst({
    where: eq(users.id, params.userId),
    columns: {
      id: true,
      name: true,
      email: true,
      organisationId: true,
      role: true,
      soloAccessPreset: true,
      status: true,
      isActive: true,
      isSuspended: true,
      lastSeenAt: true,
    },
  });

  if (!target) notFound();

  if (target.role === "platform_admin") {
    redirect("/home/team/members?error=platform_admin_not_customer_member");
  }

  if (target.organisationId !== context.organisationId) {
    redirect("/home/team/members?error=user_outside_organisation");
  }

  const access = await getSoloUserAccess({
    organisationId: context.organisationId,
    userId: target.id,
  });

  if (!access) {
    redirect("/home/team/members?error=access_unavailable");
  }

  const isAdministrator = target.role === "administrator";

  return (
    <main className="min-h-screen bg-[#f7f3ed] pl-[22vw] pt-[14vh] text-black">
      <div className="px-10 py-10">
        <section className="relative overflow-hidden rounded-[32px] bg-black p-8 text-white shadow-sm">
          <div className="absolute -right-24 -top-24 size-80 rounded-full bg-orange-500/20 blur-3xl" />

          <div className="relative z-10 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-orange-400">
                Team & Permissions
              </p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight">
                Manage {target.name}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
                {target.email} · Changes apply only inside{" "}
                <span className="font-semibold text-white">
                  {context.organisationName}
                </span>.
              </p>
            </div>

            <Link
              href="/home/team/members"
              className="rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:border-orange-400 hover:bg-white/10"
            >
              ← Back to team
            </Link>
          </div>
        </section>

        {searchParams?.success ? (
          <div className="mt-6 rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-sm font-semibold text-emerald-800">
            Access updated successfully.
          </div>
        ) : null}

        {searchParams?.error ? (
          <div className="mt-6 rounded-3xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
            <p className="font-semibold">Access was not changed.</p>
            <p className="mt-1">{errorMessage(searchParams.error)}</p>
          </div>
        ) : null}

        <section className="mt-6 grid gap-4 md:grid-cols-3">
          <SummaryCard label="Role" value={formatLabel(target.role)} />
          <SummaryCard label="Access preset" value={formatLabel(access.preset)} />
          <SummaryCard
            label="Enabled permissions"
            value={String(access.permissions.length)}
          />
        </section>

        {isAdministrator ? (
          <section className="mt-6 rounded-[30px] border border-orange-200 bg-orange-50 p-7 text-orange-900 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-orange-700">
              Organisation Administrator
            </p>
            <h2 className="mt-2 text-2xl font-semibold">
              Full Solo Workspace access
            </h2>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-orange-800/80">
              Administrator is the customer organisation's full-access role.
              Every user with role "administrator" can access Team & Permissions
              and receives every Solo Workspace permission. Waste X platform
              administrators are a separate role and are managed under /admin.
            </p>
          </section>
        ) : (
          <AccessEditor
            userId={target.id}
            userName={target.name}
            currentUser={target.id === context.userId}
            initialPreset={access.preset}
            initialPermissions={access.permissions}
          />
        )}
      </div>
    </main>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
      <p className="text-xs text-black/40">{label}</p>
      <p className="mt-3 text-lg font-semibold">{value}</p>
    </div>
  );
}

function errorMessage(value: string) {
  if (value === "platform_admin_not_customer_member") {
    return "Waste X platform administrators are separate from customer organisation administrators and cannot be managed here.";
  }
  if (value === "user_outside_organisation") {
    return "That user belongs to a different organisation and cannot be managed from this workspace.";
  }
  if (value === "access_unavailable") {
    return "Waste X could not resolve this user's Solo Workspace access.";
  }
  return "Please review the requested access and try again.";
}

function formatLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
