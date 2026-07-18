"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  FiUserPlus,
  FiX,
  FiAlertTriangle,
  FiCheckCircle,
} from "react-icons/fi";
import { useForm } from "react-hook-form";
import { useState, type Dispatch, type SetStateAction } from "react";

import { inviteTeamMemberAction } from "@/modules/team/actions/inviteTeamMemberAction";
import { sendRegEmail } from "@/util/sendRegEmail";
import { useAction } from "@/lib/actions/useAction";

/* =========================================================
   TYPES
========================================================= */

type Department = {
  id: string;
  name: string;
  type: string;
};

type InviteRole = "employee" | "seniorManagement" | "administrator";

type NewMemberModalProps = {
  isOpen: boolean;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
  departments?: Department[];
};

type InviteFormData = {
  name: string;
  email: string;
  role: InviteRole;
  departmentId: string;
};

/*
  Keep this intentionally loose.

  inviteTeamMemberAction currently returns success as boolean, not literal
  true/false, so a discriminated union causes production build errors.
*/
type InviteResponse = {
  success?: boolean;
  message?: string;
  token?: string;
};

/* =========================================================
   MODAL
========================================================= */

export default function NewMemberModal({
  isOpen,
  setIsOpen,
  departments = [],
}: NewMemberModalProps) {
  function closeModal() {
    setIsOpen(false);
  }

  return (
    <AnimatePresence>
      {isOpen && (
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
            className="relative mt-20 w-full max-w-2xl overflow-hidden rounded-3xl border border-white/10 bg-[#111111] text-white shadow-2xl"
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
                    Team Onboarding
                  </p>

                  <h3 className="mt-1 text-2xl font-semibold">
                    Invite Team Member
                  </h3>

                  <p className="mt-1 text-sm text-white/50">
                    Assign role and department access before the user joins.
                  </p>
                </div>
              </div>
            </div>

            <div className="relative p-6">
              <RegisterForm departments={departments} onSuccess={closeModal} />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* =========================================================
   FORM
========================================================= */

function RegisterForm({
  departments,
  onSuccess,
}: {
  departments: Department[];
  onSuccess: () => void;
}) {
  const { register, handleSubmit, reset } = useForm<InviteFormData>({
    defaultValues: {
      name: "",
      email: "",
      role: "employee",
      departmentId: "",
    },
  });

  const run = useAction();

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
      const departmentId = data.departmentId.trim();

      if (!name) {
        setError("Please enter the team member name.");
        return;
      }

      if (!email) {
        setError("Please enter the team member email.");
        return;
      }

      if (!departmentId) {
        setError("Please assign the user to a department.");
        return;
      }

      const response = (await run(() =>
        inviteTeamMemberAction({
          name,
          email,
          role: data.role,
          departmentId,
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

      await sendRegEmail({
        name,
        email,
        token: response.token,
      });

      setMessage("Invitation sent successfully.");

      reset({
        name: "",
        email: "",
        role: "employee",
        departmentId: "",
      });

      setTimeout(() => {
        onSuccess();
      }, 800);
    } catch (caughtError) {
      console.error("Invite team member error:", caughtError);

      setError("Something went wrong while sending the invitation.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-6 gap-5">
      {message && (
        <div className="col-span-6 flex gap-3 rounded-2xl border border-green-500/20 bg-green-500/10 p-4 text-sm text-green-300">
          <FiCheckCircle className="mt-0.5 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div className="col-span-6 flex gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
          <FiAlertTriangle className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {departments.length === 0 && (
        <div className="col-span-6 rounded-2xl border border-orange-500/20 bg-orange-500/10 p-4 text-sm leading-6 text-orange-300">
          No departments found. Create organisation departments before inviting
          team members.
        </div>
      )}

      <div className="col-span-6 md:col-span-3">
        <label className="text-sm text-white/70">Full Name</label>

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
        <label className="text-sm text-white/70">Organisation Role</label>

        <select
          required
          {...register("role", { required: true })}
          className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-orange-500"
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
        <label className="text-sm text-white/70">Department</label>

        <p className="mt-1 text-xs text-white/40">
          This controls which operational area the user works in.
        </p>

        <select
          required
          disabled={departments.length === 0}
          {...register("departmentId", { required: true })}
          className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option className="bg-black" value="">
            Select department
          </option>

          {departments.map((department) => (
            <option
              key={department.id}
              className="bg-black"
              value={department.id}
            >
              {department.name} — {formatDepartmentType(department.type)}
            </option>
          ))}
        </select>
      </div>

      <div className="col-span-6 mt-2">
        <button
          type="submit"
          disabled={loading || departments.length === 0}
          className="w-full rounded-xl bg-orange-500 py-3 text-sm font-semibold text-black transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Sending invitation..." : "Send Invitation"}
        </button>
      </div>
    </form>
  );
}

/* =========================================================
   HELPERS
========================================================= */

function formatDepartmentType(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}