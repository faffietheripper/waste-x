"use client";

import { useMemo, useState } from "react";

import {
  SOLO_PERMISSION_GROUPS,
  type SoloAccessPreset,
  type SoloPermission,
} from "@/modules/solo-permissions/core/permissions";
import {
  SOLO_ACCESS_PRESET_OPTIONS,
  getPresetPermissions,
} from "@/modules/solo-permissions/core/presets";

import { updateMemberAccessAction } from "../actions";

export default function AccessEditor({
  userId,
  userName,
  currentUser,
  initialPreset,
  initialPermissions,
}: {
  userId: string;
  userName: string;
  currentUser: boolean;
  initialPreset: SoloAccessPreset;
  initialPermissions: SoloPermission[];
}) {
  const [preset, setPreset] = useState<SoloAccessPreset>(initialPreset);
  const [selected, setSelected] = useState<Set<SoloPermission>>(
    () => new Set(initialPermissions),
  );

  const permissionCount = selected.size;

  const allPermissions = useMemo(
    () =>
      SOLO_PERMISSION_GROUPS.flatMap((group) =>
        group.permissions.map((row) => row.permission),
      ),
    [],
  );

  function choosePreset(nextPreset: SoloAccessPreset) {
    setPreset(nextPreset);

    if (nextPreset !== "custom") {
      setSelected(getPresetPermissions(nextPreset));
    }
  }

  function toggle(permission: SoloPermission) {
    const next = new Set(selected);

    if (next.has(permission)) {
      next.delete(permission);
    } else {
      next.add(permission);
    }

    setSelected(next);
    setPreset("custom");
  }

  function setGroup(permissions: SoloPermission[], enabled: boolean) {
    const next = new Set(selected);

    for (const permission of permissions) {
      if (enabled) next.add(permission);
      else next.delete(permission);
    }

    setSelected(next);
    setPreset("custom");
  }

  return (
    <form action={updateMemberAccessAction} className="mt-6 space-y-6">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="preset" value={preset} />

      {allPermissions.map((permission) =>
        selected.has(permission) ? (
          <input
            key={permission}
            type="hidden"
            name="permission"
            value={permission}
          />
        ) : null,
      )}

      <section className="rounded-[30px] border border-black/10 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-orange-600">
              Access preset
            </p>
            <h2 className="mt-1 text-2xl font-semibold">
              Start with a sensible role
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-black/45">
              Presets are defaults, not job titles. Changing any individual
              permission automatically switches {userName} to Custom access.
            </p>
          </div>

          <div className="rounded-2xl border border-black/10 bg-[#fbfaf7] px-5 py-4 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/35">
              Effective access
            </p>
            <p className="mt-1 text-2xl font-semibold">{permissionCount}</p>
            <p className="text-xs text-black/40">permissions enabled</p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {SOLO_ACCESS_PRESET_OPTIONS.map((option) => {
            const active = preset === option.value;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => choosePreset(option.value)}
                className={`rounded-2xl border p-4 text-left transition ${
                  active
                    ? "border-orange-300 bg-orange-50 shadow-sm"
                    : "border-black/10 bg-white hover:border-orange-200"
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <p className="font-semibold">{option.label}</p>
                  <span
                    className={`size-3 rounded-full ${
                      active ? "bg-orange-500" : "bg-black/10"
                    }`}
                  />
                </div>
                <p className="mt-2 text-xs leading-5 text-black/45">
                  {option.description}
                </p>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setPreset("custom")}
            className={`rounded-2xl border p-4 text-left transition ${
              preset === "custom"
                ? "border-blue-300 bg-blue-50 shadow-sm"
                : "border-black/10 bg-white hover:border-blue-200"
            }`}
          >
            <div className="flex items-center justify-between gap-4">
              <p className="font-semibold">Custom</p>
              <span
                className={`size-3 rounded-full ${
                  preset === "custom" ? "bg-blue-500" : "bg-black/10"
                }`}
              />
            </div>
            <p className="mt-2 text-xs leading-5 text-black/45">
              Explicitly choose exactly what this user can view and change.
            </p>
          </button>
        </div>
      </section>

      {currentUser ? (
        <section className="rounded-3xl border border-orange-200 bg-orange-50 p-5 text-orange-900">
          <p className="text-sm font-semibold">You are editing your own access</p>
          <p className="mt-2 text-sm leading-6 text-orange-800/80">
            Waste X will refuse to remove your own Permission Management access.
            This prevents an organisation administrator from locking themselves
            out of team administration.
          </p>
        </section>
      ) : null}

      {SOLO_PERMISSION_GROUPS.map((group) => {
        const groupPermissions = group.permissions.map(
          (row) => row.permission,
        );
        const allEnabled = groupPermissions.every((permission) =>
          selected.has(permission),
        );

        return (
          <section
            key={group.id}
            className="rounded-[30px] border border-black/10 bg-white p-6 shadow-sm"
          >
            <div className="flex flex-col gap-4 border-b border-black/10 pb-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-orange-600">
                  {group.label}
                </p>
                <p className="mt-2 text-sm text-black/45">
                  {group.description}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setGroup(groupPermissions, !allEnabled)}
                className="rounded-full border border-black/10 bg-[#fbfaf7] px-4 py-2 text-xs font-semibold text-black/55 transition hover:border-orange-300"
              >
                {allEnabled ? "Clear group" : "Enable group"}
              </button>
            </div>

            <div className="mt-4 divide-y divide-black/10">
              {group.permissions.map((row) => {
                const enabled = selected.has(row.permission);

                return (
                  <label
                    key={row.permission}
                    className="flex cursor-pointer items-start justify-between gap-6 py-4"
                  >
                    <div>
                      <p className="text-sm font-semibold">{row.label}</p>
                      <p className="mt-1 max-w-2xl text-xs leading-5 text-black/45">
                        {row.description}
                      </p>
                      <code className="mt-2 inline-flex rounded-md bg-black/[0.04] px-2 py-1 text-[10px] text-black/40">
                        {row.permission}
                      </code>
                    </div>

                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={() => toggle(row.permission)}
                      className="mt-1 size-5 accent-orange-500"
                    />
                  </label>
                );
              })}
            </div>
          </section>
        );
      })}

      <section className="sticky bottom-5 z-20 rounded-[26px] border border-black/10 bg-black p-5 text-white shadow-2xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-400">
              Ready to save
            </p>
            <p className="mt-1 text-sm text-white/55">
              {formatLabel(preset)} · {permissionCount} enabled permissions
            </p>
          </div>

          <button
            type="submit"
            className="rounded-full bg-orange-500 px-6 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
          >
            Save access
          </button>
        </div>
      </section>
    </form>
  );
}

function formatLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
