"use client";

import { AnimatePresence, motion } from "framer-motion";
import { FiAlertCircle } from "react-icons/fi";
import { useForm, SubmitHandler } from "react-hook-form";
import { registerTeamUser } from "@/app/home/team-dashboard/actions";
import { sendRegEmail } from "@/util/sendRegEmail";

/* =========================================================
   TYPES
========================================================= */

interface NewMemberModalProps {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

interface RegisterFormData {
  name: string;
  email: string;
  role: "employee" | "seniorManagement" | "administrator";
  password: string;
  confirmPassword: string;
}

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

              <h3 className="text-3xl font-bold text-center mb-2">
                Add a New Team Member
              </h3>

              <p className="text-center mb-6 text-sm text-white/80">
                Fill out the form below to register a new team member.
              </p>

              <RegisterForm />

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

const RegisterForm = () => {
  const { register, handleSubmit, reset } = useForm<RegisterFormData>();

  const onSubmit: SubmitHandler<RegisterFormData> = async (data) => {
    if (data.password !== data.confirmPassword) {
      alert("Passwords do not match.");
      return;
    }

    const response = await registerTeamUser(data);

    if (response.success) {
      await sendRegEmail({
        name: data.name,
        email: data.email,
        password: data.password,
      });

      alert("User registered and email sent!");
      reset();
    } else {
      alert(`Error: ${response.message}`);
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="grid grid-cols-6 gap-4 text-black"
    >
      <div className="col-span-6">
        <label className="text-white text-sm">Full Name</label>
        <input
          required
          {...register("name")}
          className="mt-1 w-full h-10 p-2 rounded-md border border-gray-300 text-sm"
        />
      </div>

      <div className="col-span-6">
        <label className="text-white text-sm">Email</label>
        <input
          required
          type="email"
          {...register("email")}
          className="mt-1 w-full h-10 p-2 rounded-md border border-gray-300 text-sm"
        />
      </div>

      <div className="col-span-6">
        <label className="text-white text-sm">Role</label>
        <select
          {...register("role", { required: true })}
          className="mt-1 w-full h-10 p-2 rounded-md border border-gray-300 text-sm"
        >
          <option value="employee">Employee</option>
          <option value="seniorManagement">Senior Management</option>
          <option value="administrator">Administrator</option>
        </select>
      </div>

      <div className="col-span-6">
        <label className="text-white text-sm">Password</label>
        <input
          required
          type="password"
          {...register("password")}
          className="mt-1 w-full h-10 p-2 rounded-md border border-gray-300 text-sm"
        />
      </div>

      <div className="col-span-6">
        <label className="text-white text-sm">Confirm Password</label>
        <input
          required
          type="password"
          {...register("confirmPassword")}
          className="mt-1 w-full h-10 p-2 rounded-md border border-gray-300 text-sm"
        />
      </div>

      <div className="col-span-6">
        <button
          type="submit"
          className="w-full rounded-md border border-white bg-white text-indigo-600 px-4 py-2 text-sm font-medium hover:bg-transparent hover:text-white transition"
        >
          Create Account
        </button>
      </div>
    </form>
  );
};
