"use client";

import { useState } from "react";
import NewMemberModal from "@/components/app/TeamDashboard/NewMemberModal";

type Department = {
  id: string;
  name: string;
  type: string;
};

export default function MembersClient({
  members,
  invited,
  departments,
}: {
  members: any[];
  invited: any[];
  departments: Department[];
}) {
  const [isOpen, setIsOpen] = useState(false);

  const getDepartment = (departmentId: string | null) => {
    return departments.find((department) => department.id === departmentId);
  };

  return (
    <div className="min-h-screen bg-[#f7f3ed] px-8 py-10 mt-28">
      <div className="pl-[24vw] flex flex-col gap-8">
        <div className="rounded-3xl border border-black/10 bg-black text-white p-8 shadow-sm">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-orange-400">
                Waste X Team Control
              </p>

              <h1 className="mt-3 text-3xl font-semibold">
                Organisation Members
              </h1>

              <p className="mt-2 max-w-xl text-sm text-white/60">
                Manage team access, invitations and department-based
                permissions.
              </p>
            </div>

            <button
              onClick={() => setIsOpen(true)}
              className="rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-black hover:bg-orange-400 transition"
            >
              + Invite Member
            </button>
          </div>

          <div className="mt-8 grid grid-cols-3 gap-4">
            <Stat label="Active Members" value={members.length} />
            <Stat label="Pending Invites" value={invited.length} />
            <Stat label="Departments" value={departments.length} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6">
          <section className="col-span-2 rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-black">Active Members</h2>

            <p className="mt-1 text-sm text-black/50">
              Users currently active inside this organisation.
            </p>

            <div className="mt-6">
              {members.length === 0 ? (
                <EmptyState text="No active members yet." />
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {members.map((user) => (
                    <MemberCard
                      key={user.id}
                      user={user}
                      department={getDepartment(user.departmentId)}
                      active
                    />
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-orange-200 bg-orange-50 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-black">
              Pending Invites
            </h2>

            <p className="mt-1 text-sm text-black/50">
              Users waiting to complete account setup.
            </p>

            <div className="mt-6">
              {invited.length === 0 ? (
                <EmptyState text="No pending invites." />
              ) : (
                <div className="flex flex-col gap-4">
                  {invited.map((user) => (
                    <MemberCard
                      key={user.id}
                      user={user}
                      department={getDepartment(user.departmentId)}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      <NewMemberModal
        isOpen={isOpen}
        setIsOpen={setIsOpen}
        departments={departments}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-widest text-white/40">{label}</p>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}

function MemberCard({
  user,
  department,
  active = false,
}: {
  user: any;
  department?: Department;
  active?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-black/10 bg-[#fbfaf7] p-5 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold text-black">
            {user.name || "Unnamed User"}
          </p>
          <p className="mt-1 text-sm text-black/50">{user.email}</p>
        </div>

        <span
          className={
            active
              ? "rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700"
              : "rounded-full bg-orange-100 px-3 py-1 text-xs font-medium text-orange-700"
          }
        >
          {active ? "Active" : "Invited"}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-black/40">
            Role
          </p>
          <p className="mt-1 text-sm font-medium text-black">{user.role}</p>
        </div>

        <div>
          <p className="text-xs uppercase tracking-widest text-black/40">
            Department
          </p>

          {department ? (
            <p className="mt-1 text-sm font-medium text-black">
              {department.name}
            </p>
          ) : (
            <p className="mt-1 text-sm text-red-500">Not assigned</p>
          )}
        </div>
      </div>

      {department && (
        <div className="mt-4">
          <span className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs text-black/70">
            {department.type}
          </span>
        </div>
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-black/20 bg-black/[0.02] p-8 text-center text-sm text-black/50">
      {text}
    </div>
  );
}
