"use client";

import { AnimatePresence, motion } from "framer-motion";
import { FiAlertCircle } from "react-icons/fi";
import { useForm } from "react-hook-form";
import { useState } from "react";

import { registerTeamUser } from "@/app/home/team-dashboard/actions";
import { sendRegEmail } from "@/util/sendRegEmail";
import { useAction } from "@/lib/actions/useAction";

/* =========================================================
   TYPES
========================================================= */

interface NewMemberModalProps {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

interface InviteFormData {
  name: string;
  email: string;
  role: "employee" | "seniorManagement" | "administrator";
}

type InviteResponse =
  | { success: true; token: string }
  | { success: false; message: string };

/* =========================================================
   MODAL COMPONENT
========================================================= */

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
          className="bg-slate-900/20 backdrop-blur p-8 fixed inset-0 z-50 flex justify-center items-start overflow-y-auto cursor-pointer"
        >
          <motion.div
            initial={{ scale: 0, rotate: "12.5deg" }}
            animate={{ scale: 1, rotate: "0deg" }}
            exit={{ scale: 0, rotate: "0deg" }}
            onClick={(e) => e.stopPropagation()}
            className="bg-gradient-to-br from-violet-600 to-indigo-600 text-white p-6 rounded-lg w-full max-w-lg shadow-xl cursor-default relative overflow-hidden"
          >
            <FiAlertCircle className="text-white/10 rotate-12 text-[250px] absolute z-0 -top-24 -left-24" />

            <div className="relative z-10">
              <div className="bg-white w-16 h-16 mb-2 rounded-full text-3xl text-indigo-600 grid place-items-center mx-auto">
                <FiAlertCircle />
              </div>

              <h3 className="text-2xl font-semibold text-center mb-2">
                Invite Team Member
              </h3>

              <p className="text-center mb-6 text-sm text-neutral-300">
                An invitation link will be sent to the user to complete their
                account setup.
              </p>

              <RegisterForm onSuccess={() => setIsOpen(false)} />

              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => setIsOpen(false)}
                  className="bg-transparent hover:bg-white/10 transition-colors text-white font-semibold w-full py-2 rounded"
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* =========================================================
   REGISTER FORM
========================================================= */

const RegisterForm = ({ onSuccess }: { onSuccess: () => void }) => {
  const { register, handleSubmit, reset } = useForm<InviteFormData>();
  const [loading, setLoading] = useState(false);

  const run = useAction();

  const onSubmit = async (data: InviteFormData) => {
    setLoading(true);

    const response = await run<InviteResponse>(() => registerTeamUser(data));

    if (response && response.success === true) {
      // ✅ send email AFTER successful invite
      await sendRegEmail({
        name: data.name,
        email: data.email,
        token: response.token,
      });

      reset();
      onSuccess();
    }

    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-6 gap-4">
      <div className="col-span-6">
        <label className="text-white text-sm">Full Name</label>
        <input
          required
          {...register("name")}
          className="mt-1 w-full bg-black border border-neutral-700 p-2 text-sm text-white"
        />
      </div>

      <div className="col-span-6">
        <label className="text-white text-sm">Email</label>
        <input
          required
          type="email"
          {...register("email")}
          className="mt-1 w-full bg-black border border-neutral-700 p-2 text-sm text-white"
        />
      </div>

      <div className="col-span-6">
        <label className="text-white text-sm">Role</label>
        <select
          {...register("role", { required: true })}
          className="mt-1 w-full bg-black border border-neutral-700 p-2 text-sm text-white"
        >
          <option value="employee">Employee</option>
          <option value="seniorManagement">Senior Management</option>
          <option value="administrator">Administrator</option>
        </select>
      </div>

      <div className="col-span-6">
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-orange-500 text-black py-2 text-sm font-medium hover:bg-orange-600 transition disabled:opacity-50"
        >
          {loading ? "Sending..." : "Send Invitation"}
        </button>
      </div>
    </form>
  );
};
