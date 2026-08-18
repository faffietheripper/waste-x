"use client";

import Link from "next/link";
import { useState } from "react";

import NewMemberModal from "@/components/app/TeamDashboard/NewMemberModal";

import {
  cancelInviteAction,
  reactivateMemberAction,
  suspendMemberAction,
} from "./actions";
import InviteActionsClient from "./_components/InviteActionsClient";

type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "INVITED" | "ACTIVE" | "SUSPENDED";
  isActive: boolean;
  isSuspended: boolean;
  createdAt: Date | null;
  lastSeenAt: Date | null;
  inviteExpiry: Date | null;
  effectivePreset:
    | "administrator"
    | "management"
    | "operations"
    | "compliance"
    | "accounts"
    | "read_only"
    | "custom";
  permissionCount: number;
  isCurrentUser: boolean;
};

type Props = {
  members: TeamMember[];
  organisationName: string;
  canInvite: boolean;
  canManage: boolean;
  canManagePermissions: boolean;
};

export default function MembersClient({
  members,
  organisationName,
  canInvite,
  canManage,
  canManagePermissions,
}: Props) {
  const [inviteOpen, setInviteOpen] = useState(false);

  const active = members.filter(
    (member) =>
      member.status === "ACTIVE" &&
      member.isActive &&
      !member.isSuspended,
  );

  const invited = members.filter((member) => member.status === "INVITED");

  const suspended = members.filter(
    (member) =>
      member.status === "SUSPENDED" ||
      member.isSuspended,
  );

  return (
    <main className="min-h-screen bg-[#f7f3ed] pl-[22vw] pt-[14vh] text-black">
      <div className="px-10 py-10">
        <section className="relative overflow-hidden rounded-[32px] bg-black p-8 text-white shadow-sm">
          <div className="absolute -right-24 -top-24 size-80 rounded-full bg-orange-500/20 blur-3xl" />

          <div className="relative z-10 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-orange-400">
                Solo Workspace · Team Control
              </p>

              <h1 className="mt-4 text-4xl font-semibold tracking-tight">
                Team & Permissions
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
                Control who can operate jobs, submit DWT, see financial
                information and manage your organisation. Access is scoped to{" "}
                <span className="font-semibold text-white">{organisationName}</span>.
              </p>
            </div>

            {canInvite ? (
              <button
                type="button"
                onClick={() => setInviteOpen(true)}
                className="rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
              >
                + Invite member
              </button>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm text-white/45">
                Invite permission required
              </div>
            )}
          </div>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-3">
          <Metric label="Active members" value={active.length} />
          <Metric label="Pending invites" value={invited.length} />
          <Metric label="Suspended" value={suspended.length} />
        </section>

        <section className="mt-8 rounded-[30px] border border-black/10 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 border-b border-black/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-orange-600">
                Active access
              </p>
              <h2 className="mt-1 text-2xl font-semibold">Organisation members</h2>
              <p className="mt-2 text-sm text-black/45">
                Presets give sensible defaults. Custom access lets an administrator
                make exceptions without inventing another job title.
              </p>
            </div>

            {canManagePermissions ? (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                Permission manager
              </span>
            ) : null}
          </div>

          {active.length === 0 ? (
            <EmptyState text="No active members yet." />
          ) : (
            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              {active.map((member) => (
                <MemberCard
                  key={member.id}
                  member={member}
                  canManage={canManage}
                  canManagePermissions={canManagePermissions}
                />
              ))}
            </div>
          )}
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-2">
          <div className="rounded-[30px] border border-orange-200 bg-orange-50 p-6 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-orange-700">
              Pending
            </p>
            <h2 className="mt-1 text-xl font-semibold">Invitations</h2>

            {invited.length === 0 ? (
              <EmptyState text="No pending invitations." />
            ) : (
              <div className="mt-5 space-y-3">
                {invited.map((member) => (
                  <div
                    key={member.id}
                    className="rounded-2xl border border-orange-200 bg-white p-5"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-semibold">{member.name}</p>
                        <p className="mt-1 text-sm text-black/45">{member.email}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <PresetPill preset={member.effectivePreset} />
                          <span className="rounded-full border border-black/10 bg-black/[0.03] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-black/45">
                            Invite expires {formatDate(member.inviteExpiry)}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {canManagePermissions ? (
                          <Link
                            href={`/home/team/members/${member.id}`}
                            className="rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-black transition hover:border-orange-300"
                          >
                            Change access
                          </Link>
                        ) : null}

                        {canManage ? (
                          <>
                            <InviteActionsClient userId={member.id} />

                            <form action={cancelInviteAction}>
                              <input type="hidden" name="userId" value={member.id} />
                              <button
                                type="submit"
                                className="rounded-full border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100"
                              >
                                Cancel
                              </button>
                            </form>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-[30px] border border-black/10 bg-white p-6 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-black/35">
              Access lifecycle
            </p>
            <h2 className="mt-1 text-xl font-semibold">Suspended members</h2>

            {suspended.length === 0 ? (
              <EmptyState text="No suspended members." />
            ) : (
              <div className="mt-5 space-y-3">
                {suspended.map((member) => (
                  <div
                    key={member.id}
                    className="rounded-2xl border border-black/10 bg-[#fbfaf7] p-5"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-semibold">{member.name}</p>
                        <p className="mt-1 text-sm text-black/45">{member.email}</p>
                        <div className="mt-3">
                          <PresetPill preset={member.effectivePreset} />
                        </div>
                      </div>

                      {canManage ? (
                        <form action={reactivateMemberAction}>
                          <input type="hidden" name="userId" value={member.id} />
                          <button
                            type="submit"
                            className="rounded-full bg-black px-4 py-2 text-xs font-semibold text-white transition hover:bg-orange-500 hover:text-black"
                          >
                            Reactivate
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="mt-6 rounded-[30px] border border-blue-200 bg-blue-50 p-6 text-blue-900">
          <p className="text-sm font-semibold">Security rule</p>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-blue-800/80">
            The permission switches are not just menu visibility. The next
            enforcement pass will apply the same permission engine to page
            guards and server actions, so a restricted user cannot bypass access
            by typing a protected URL manually.
          </p>
        </section>
      </div>

      {canInvite ? (
        <NewMemberModal
          isOpen={inviteOpen}
          setIsOpen={setInviteOpen}
        />
      ) : null}
    </main>
  );
}

function MemberCard({
  member,
  canManage,
  canManagePermissions,
}: {
  member: TeamMember;
  canManage: boolean;
  canManagePermissions: boolean;
}) {
  return (
    <article className="rounded-3xl border border-black/10 bg-[#fbfaf7] p-5 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{member.name}</p>
            {member.isCurrentUser ? (
              <span className="rounded-full bg-black px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-orange-400">
                You
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-black/45">{member.email}</p>
        </div>

        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
          Active
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <PresetPill preset={member.effectivePreset} />
        <span className="rounded-full border border-black/10 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-black/45">
          {member.permissionCount} permissions
        </span>
        <span className="rounded-full border border-black/10 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-black/45">
          Last seen {formatDate(member.lastSeenAt)}
        </span>
      </div>

      <div className="mt-5 flex flex-wrap gap-2 border-t border-black/10 pt-4">
        {canManagePermissions ? (
          <Link
            href={`/home/team/members/${member.id}`}
            className="rounded-full bg-black px-4 py-2 text-xs font-semibold text-white transition hover:bg-orange-500 hover:text-black"
          >
            Manage access
          </Link>
        ) : null}

        {canManage && !member.isCurrentUser ? (
          <form action={suspendMemberAction}>
            <input type="hidden" name="userId" value={member.id} />
            <button
              type="submit"
              className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100"
            >
              Suspend
            </button>
          </form>
        ) : null}
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
      <p className="text-xs text-black/40">{label}</p>
      <p className="mt-3 text-3xl font-semibold">{value}</p>
    </div>
  );
}

function PresetPill({ preset }: { preset: TeamMember["effectivePreset"] }) {
  return (
    <span
      className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
        preset === "administrator"
          ? "border-orange-200 bg-orange-50 text-orange-700"
          : preset === "custom"
            ? "border-blue-200 bg-blue-50 text-blue-700"
            : "border-black/10 bg-white text-black/55"
      }`}
    >
      {formatLabel(preset)}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="mt-5 rounded-2xl border border-dashed border-black/15 bg-black/[0.02] p-8 text-center text-sm text-black/45">
      {text}
    </div>
  );
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(date);
}

function formatLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
