import ProfileForm from "@/components/app/ProfileForm";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

/* =========================================================
   PAGE
========================================================= */

export default async function ProfileSettingsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const userRole = session.user.role ?? "";

  const knownRoles = [
    "administrator",
    "seniorManagement",
    "employee",
    "platform_admin",
  ];

  return (
    <div className="space-y-8">
      {/* HEADER */}
      <section className="rounded-3xl border border-black/10 bg-black p-8 text-white shadow-sm">
        <p className="text-xs uppercase tracking-[0.25em] text-orange-400">
          Waste X Profile
        </p>

        <h1 className="mt-3 text-3xl font-semibold">Profile Settings</h1>

        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
          Manage your personal Waste X profile details. These details are used
          across audit records, assignments, incident reporting and account
          activity.
        </p>
      </section>

      {/* CONTENT */}
      {knownRoles.includes(userRole) ? (
        <ProfileForm />
      ) : (
        <section className="rounded-3xl border border-orange-200 bg-orange-50 p-8 text-sm text-orange-800 shadow-sm">
          <p className="font-semibold">No role assigned</p>
          <p className="mt-2 leading-6">
            Your account does not currently have a valid role. Contact your
            administrator or platform support before continuing.
          </p>
        </section>
      )}
    </div>
  );
}
