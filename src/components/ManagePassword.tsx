"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { updatePassword } from "@/app/home/me/account/actions";
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
  const { data: session } = useSession();
  const router = useRouter();
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PasswordFormInputs>({
    resolver: zodResolver(PasswordSchema),
  });

  /* =========================================================
     SUBMIT
  ========================================================= */

  async function onSubmit(data: PasswordFormInputs) {
    if (!session?.user?.id || loading) return;

    setLoading(true);

    try {
      const result = await updatePassword({
        userId: session.user.id,
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });

      if (!result.success) {
        toast({
          title: "Update failed",
          description: result.message,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Password updated",
        description: "Your password has been changed successfully.",
      });

      router.refresh();
    } catch (error) {
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
  ========================================================= */

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="max-w-md mx-auto space-y-6"
    >
      <h2 className="text-xl font-semibold">Update Your Password</h2>

      {/* CURRENT PASSWORD */}
      <div>
        <label className="text-sm font-medium">Current Password</label>
        <input
          type="password"
          {...register("currentPassword")}
          className="mt-1 w-full border rounded-md p-2"
        />
        {errors.currentPassword && (
          <p className="text-red-600 text-sm mt-1">
            {errors.currentPassword.message}
          </p>
        )}
      </div>

      {/* NEW PASSWORD */}
      <div>
        <label className="text-sm font-medium">New Password</label>
        <input
          type="password"
          {...register("newPassword")}
          className="mt-1 w-full border rounded-md p-2"
        />
        {errors.newPassword && (
          <p className="text-red-600 text-sm mt-1">
            {errors.newPassword.message}
          </p>
        )}
      </div>

      {/* CONFIRM PASSWORD */}
      <div>
        <label className="text-sm font-medium">Confirm New Password</label>
        <input
          type="password"
          {...register("confirmPassword")}
          className="mt-1 w-full border rounded-md p-2"
        />
        {errors.confirmPassword && (
          <p className="text-red-600 text-sm mt-1">
            {errors.confirmPassword.message}
          </p>
        )}
      </div>

      {/* SUBMIT */}
      <button
        type="submit"
        disabled={loading}
        className="bg-blue-600 text-white py-2 px-4 rounded-md w-full disabled:opacity-50"
      >
        {loading ? "Updating..." : "Update Password"}
      </button>
    </form>
  );
}
