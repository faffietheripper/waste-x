"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiUserPlus,
  FiX,
} from "react-icons/fi";
import { useState, type Dispatch, type SetStateAction } from "react";
import { useForm } from "react-hook-form";

import { useAction } from "@/lib/actions/useAction";
import type { SoloAccessPreset } from "@/modules/solo-permissions/core/permissions";
import { SOLO_ACCESS_PRESET_OPTIONS } from "@/modules/solo-permissions/core/presets";
import { inviteTeamMemberAction } from "@/modules/team/actions/inviteTeamMemberAction";
import { sendRegEmail } from "@/util/sendRegEmail";

type NewMemberModalProps = {
  isOpen: boolean;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
};

type InvitePreset = Exclude<SoloAccessPreset, "custom">;

type InviteFormData = {
  name: string;
  email: string;
  accessPreset: InvitePreset;
};

type InviteResponse = {
  success?: boolean;
  message?: string;
  token?: string;
};

export default function NewMemberModal({
  isOpen,
  setIsOpen,
}: NewMemberModalProps) {
  function closeModal() {
    setIsOpen(false);
  }

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={closeModal}
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-8 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            onClick={(event) => event.stopPropagation()}
            className="relative mt-16 w-full max-w-3xl overflow-hidden rounded-3xl border border-white/10 bg-[#111111] text-white shadow-2xl"
          >
            <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-orange-500/20 blur-3xl" />

            <div className="relative border-b border-white/10 p-6">
              <button
                type="button"
                onClick={closeModal}
                className="absolute right-5 top-5 rounded-full p-2 text-white/50 transition hover:bg-white/10 hover:text-white"
                aria-label="Close invite modal"
              >
                <FiX />
              </button>

              <div className="flex items-center gap-4">
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-orange-500 text-2xl text-black">
                  <FiUserPlus />
                </div>

                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-orange-400">
                    Solo Workspace Team
                  </p>

                  <h3 className="mt-1 text-2xl font-semibold">
                    Invite Team Member
                  </h3>

                  <p className="mt-1 text-sm text-white/50">
                    Choose access before the user joins. Solo Workspace does not
                    require a department.
                  </p>
                </div>
              </div>
            </div>

            <div className="relative p-6">
              <RegisterForm onSuccess={closeModal} />
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function RegisterForm({ onSuccess }: { onSuccess: () => void }) {
  const { register, handleSubmit, reset, watch } = useForm<InviteFormData>({
    defaultValues: {
      name: "",
      email: "",
      accessPreset: "operations",
    },
  });

  const run = useAction();
  const selectedPreset = watch("accessPreset");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(data: InviteFormData) {
    if (loading) return;

    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const name = data.name.trim();
      const email = data.email.trim();

      if (!name || !email) {
        setError("Name and email are required.");
        return;
      }

      const response = (await run(() =>
        inviteTeamMemberAction({
          name,
          email,
          accessPreset: data.accessPreset,
        }),
      )) as InviteResponse | null;

      if (!response?.success) {
        setError(response?.message || "Failed to create invitation.");
        return;
      }

      if (!response.token) {
        setError("Invitation was created but no invite token was returned.");
        return;
      }

      const emailResult = await sendRegEmail({
        name,
        email,
        token: response.token,
      });

      if (!emailResult.success) {
        setError(
          emailResult.message ??
            "Invitation was created, but the email could not be sent.",
        );
        return;
      }

      setMessage("Invitation sent successfully.");

      reset({
        name: "",
        email: "",
        accessPreset: "operations",
      });

      setTimeout(onSuccess, 700);
    } catch (caughtError) {
      console.error("Invite team member error:", caughtError);
      setError("Something went wrong while sending the invitation.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-6 gap-5">
      {message ? (
        <div className="col-span-6 flex gap-3 rounded-2xl border border-green-500/20 bg-green-500/10 p-4 text-sm text-green-300">
          <FiCheckCircle className="mt-0.5 shrink-0" />
          <span>{message}</span>
        </div>
      ) : null}

      {error ? (
        <div className="col-span-6 flex gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
          <FiAlertTriangle className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="col-span-6 md:col-span-3">
        <label className="text-sm text-white/70">Full name</label>
        <input
          required
          {...register("name", { required: true })}
          className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-orange-500"
          placeholder="e.g. Jamie Smith"
        />
      </div>

      <div className="col-span-6 md:col-span-3">
        <label className="text-sm text-white/70">Email</label>
        <input
          required
          type="email"
          {...register("email", { required: true })}
          className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-orange-500"
          placeholder="name@company.com"
        />
      </div>

      <div className="col-span-6">
        <label className="text-sm text-white/70">Access preset</label>
        <p className="mt-1 text-xs text-white/40">
          You can customise individual permissions after the invitation is created.
        </p>

        <select
          {...register("accessPreset")}
          className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-orange-500"
        >
          {SOLO_ACCESS_PRESET_OPTIONS.map((option) => (
            <option
              key={option.value}
              value={option.value}
              className="bg-black"
            >
              {option.label}
            </option>
          ))}
        </select>

        <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs leading-5 text-white/50">
          {
            SOLO_ACCESS_PRESET_OPTIONS.find(
              (option) => option.value === selectedPreset,
            )?.description
          }
        </div>
      </div>

      <div className="col-span-6 mt-2">
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-orange-500 py-3 text-sm font-semibold text-black transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Sending invitation..." : "Send invitation"}
        </button>
      </div>
    </form>
  );
}
