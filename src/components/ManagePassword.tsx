"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { updatePasswordAction } from "@/app/home/settings/account/actions";
import { useToast } from "@/components/ui/use-toast";
import { z } from "zod";

/* =========================================================
   SCHEMA
========================================================= */

const PasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z
      .string()
      .min(8, "Password must be at least 8 characters"),
  })
  .superRefine(({ newPassword, confirmPassword }, ctx) => {
    if (newPassword !== confirmPassword) {
      ctx.addIssue({
        code: "custom",
        message: "Passwords do not match",
        path: ["confirmPassword"],
      });
    }
  });

type PasswordFormInputs = z.infer<typeof PasswordSchema>;

/* =========================================================
   COMPONENT
========================================================= */

export default function UpdatePasswordForm() {
  const router = useRouter();
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PasswordFormInputs>({
    resolver: zodResolver(PasswordSchema),
  });

  /* =========================================================
     SUBMIT
  ========================================================== */

  async function onSubmit(data: PasswordFormInputs) {
    if (loading) return;

    setLoading(true);

    try {
      const result = await updatePasswordAction({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });

      if (!result?.success) {
        toast({
          title: "Update failed",
          description: result?.message || "Could not update your password.",
          variant: "destructive",
        });

        return;
      }

      toast({
        title: "Password updated",
        description: "Your password has been changed successfully.",
      });

      reset();
      router.refresh();
    } catch (error) {
      console.error("Password update error:", error);

      toast({
        title: "Error",
        description: "Something went wrong while updating your password.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  /* =========================================================
     UI
  ========================================================== */

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="mx-auto max-w-md space-y-6"
    >
      <h2 className="text-xl font-semibold text-black">
        Update Your Password
      </h2>

      {/* CURRENT PASSWORD */}
      <div>
        <label className="text-sm font-medium text-black">
          Current Password
        </label>

        <input
          type="password"
          {...register("currentPassword")}
          className="mt-1 w-full rounded-md border border-black/10 bg-white p-3 text-black outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
        />

        {errors.currentPassword && (
          <p className="mt-1 text-sm text-red-600">
            {errors.currentPassword.message}
          </p>
        )}
      </div>

      {/* NEW PASSWORD */}
      <div>
        <label className="text-sm font-medium text-black">New Password</label>

        <input
          type="password"
          {...register("newPassword")}
          className="mt-1 w-full rounded-md border border-black/10 bg-white p-3 text-black outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
        />

        {errors.newPassword && (
          <p className="mt-1 text-sm text-red-600">
            {errors.newPassword.message}
          </p>
        )}
      </div>

      {/* CONFIRM PASSWORD */}
      <div>
        <label className="text-sm font-medium text-black">
          Confirm New Password
        </label>

        <input
          type="password"
          {...register("confirmPassword")}
          className="mt-1 w-full rounded-md border border-black/10 bg-white p-3 text-black outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
        />

        {errors.confirmPassword && (
          <p className="mt-1 text-sm text-red-600">
            {errors.confirmPassword.message}
          </p>
        )}
      </div>

      {/* SUBMIT */}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-black px-4 py-3 font-semibold text-orange-400 transition hover:bg-orange-500 hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Updating..." : "Update Password"}
      </button>
    </form>
  );
}