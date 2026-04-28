"use client";

import { AnimatePresence, motion } from "framer-motion";
import { FiUserPlus, FiX } from "react-icons/fi";
import { useForm } from "react-hook-form";
import { useState } from "react";

import { inviteTeamMemberAction } from "@/modules/team/actions/inviteTeamMemberAction";
import { sendRegEmail } from "@/util/sendRegEmail";
import { useAction } from "@/lib/actions/useAction";

interface NewMemberModalProps {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

interface InviteFormData {
  name: string;
  email: string;
  role: "employee" | "seniorManagement" | "administrator";
  departments: string[];
}

type InviteResponse =
  | { success: true; token: string }
  | { success: false; message: string };

const departmentOptions = [
  {
    value: "generator",
    label: "Generator",
    description: "Can create and manage outgoing waste assignments.",
  },
  {
    value: "carrier",
    label: "Carrier",
    description: "Can collect jobs and report incidents.",
  },
  {
    value: "compliance",
    label: "Compliance",
    description: "Can audit assignments and resolve incidents.",
  },
];

export default function NewMemberModal({
  isOpen,
  setIsOpen,
}: NewMemberModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-8 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            onClick={(e) => e.stopPropagation()}
            className="relative mt-20 w-full max-w-2xl overflow-hidden rounded-3xl border border-white/10 bg-[#111111] text-white shadow-2xl"
          >
            <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-orange-500/20 blur-3xl" />

            <div className="relative border-b border-white/10 p-6">
              <button
                onClick={() => setIsOpen(false)}
                className="absolute right-5 top-5 rounded-full p-2 text-white/50 hover:bg-white/10 hover:text-white"
              >
                <FiX />
              </button>

              <div className="flex items-center gap-4">
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-orange-500 text-2xl text-black">
                  <FiUserPlus />
                </div>

                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-orange-400">
                    Team Onboarding
                  </p>
                  <h3 className="mt-1 text-2xl font-semibold">
                    Invite Team Member
                  </h3>
                  <p className="mt-1 text-sm text-white/50">
                    Assign their role and operational department access before
                    they join.
                  </p>
                </div>
              </div>
            </div>

            <div className="relative p-6">
              <RegisterForm onSuccess={() => setIsOpen(false)} />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function RegisterForm({ onSuccess }: { onSuccess: () => void }) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<InviteFormData>({
    defaultValues: {
      role: "employee",
      departments: ["generator"],
    },
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useAction();
  const selectedDepartments = watch("departments") ?? [];

  const onSubmit = async (data: InviteFormData) => {
    setLoading(true);
    setMessage(null);
    setError(null);

    if (!data.departments || data.departments.length === 0) {
      setError("Please assign at least one department.");
      setLoading(false);
      return;
    }

    const response = await run<InviteResponse>(() =>
      inviteTeamMemberAction(data),
    );

    if (!response?.success) {
      setError(response?.message || "Failed to create invitation.");
      setLoading(false);
      return;
    }

    await sendRegEmail({
      name: data.name,
      email: data.email,
      token: response.token,
    });

    setMessage("Invitation sent successfully.");
    reset();

    setTimeout(() => {
      onSuccess();
    }, 700);

    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-6 gap-5">
      {message && (
        <div className="col-span-6 rounded-2xl border border-green-500/20 bg-green-500/10 p-4 text-sm text-green-300">
          {message}
        </div>
      )}

      {error && (
        <div className="col-span-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="col-span-6 md:col-span-3">
        <label className="text-sm text-white/70">Full Name</label>
        <input
          required
          {...register("name", { required: true })}
          className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-orange-500"
          placeholder="e.g. Jamie Smith"
        />
      </div>

      <div className="col-span-6 md:col-span-3">
        <label className="text-sm text-white/70">Email</label>
        <input
          required
          type="email"
          {...register("email", { required: true })}
          className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-orange-500"
          placeholder="name@company.com"
        />
      </div>

      <div className="col-span-6">
        <label className="text-sm text-white/70">Organisation Role</label>
        <select
          {...register("role", { required: true })}
          className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-orange-500"
        >
          <option className="bg-black" value="employee">
            Employee
          </option>
          <option className="bg-black" value="seniorManagement">
            Senior Management
          </option>
          <option className="bg-black" value="administrator">
            Administrator
          </option>
        </select>
      </div>

      <div className="col-span-6">
        <div className="mb-3">
          <label className="text-sm text-white/70">Department Access</label>
          <p className="mt-1 text-xs text-white/40">
            This controls what part of Waste X the user can operate in.
          </p>
        </div>

        <div className="grid gap-3">
          {departmentOptions.map((department) => {
            const selected = selectedDepartments.includes(department.value);

            return (
              <label
                key={department.value}
                className={`cursor-pointer rounded-2xl border p-4 transition ${
                  selected
                    ? "border-orange-500 bg-orange-500/10"
                    : "border-white/10 bg-white/5 hover:bg-white/10"
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    value={department.value}
                    {...register("departments")}
                    className="mt-1 accent-orange-500"
                  />

                  <div>
                    <p className="text-sm font-semibold text-white">
                      {department.label}
                    </p>
                    <p className="mt-1 text-xs text-white/45">
                      {department.description}
                    </p>
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      <div className="col-span-6 mt-2 flex gap-3">
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-orange-500 py-3 text-sm font-semibold text-black transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Sending invitation..." : "Send Invitation"}
        </button>
      </div>
    </form>
  );
}
