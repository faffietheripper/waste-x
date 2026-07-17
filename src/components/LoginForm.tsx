"use client";

import React, { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/app/login/actions";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoginSchema } from "@/util/authSchema";
import { FiEye, FiEyeOff } from "react-icons/fi";

/* =========================================================
   TYPES
========================================================= */

type LoginFormInputs = z.infer<typeof LoginSchema>;

/* =========================================================
   COMPONENT
========================================================= */

export default function LoginForm() {
  const router = useRouter();

  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const errorContainerRef = useRef<HTMLDivElement | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormInputs>({
    resolver: zodResolver(LoginSchema),
  });

  /* =========================================================
     SUBMIT
  ========================================================= */

  const onSubmit = async (data: LoginFormInputs) => {
    setServerError(null);
    setLoading(true);

    const res = await login(data);

    setLoading(false);

    if (!res.success) {
      setServerError(res.message || "Invalid email or password.");

      if (errorContainerRef.current) {
        errorContainerRef.current.focus();
      }

      return;
    }

    if (res.data?.role === "platform_admin") {
      router.push("/admin");
    } else {
      router.push("/home");
    }
  };

  /* =========================================================
     UI
  ========================================================= */

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="mt-8 grid grid-cols-6 gap-6"
    >
      {/* SERVER ERROR */}
      {serverError && (
        <div
          ref={errorContainerRef}
          tabIndex={-1}
          className="col-span-6 rounded-xl border border-red-400 bg-red-100 p-4 text-sm text-red-700"
          role="alert"
          aria-live="polite"
        >
          {serverError}
        </div>
      )}

      {/* EMAIL */}
      <div className="col-span-6">
        <label
          htmlFor="email"
          className="block text-sm font-medium text-gray-700"
        >
          Email
        </label>

        <input
          type="email"
          id="email"
          {...register("email")}
          className="mt-1 h-12 w-full rounded-md border border-gray-200 bg-white p-3 text-sm text-gray-700 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? "email-error" : undefined}
        />

        {errors.email && (
          <p
            id="email-error"
            className="mt-1 text-sm text-red-500"
            role="alert"
          >
            {errors.email.message}
          </p>
        )}
      </div>

      {/* PASSWORD */}
      <div className="col-span-6">
        <label
          htmlFor="password"
          className="block text-sm font-medium text-gray-700"
        >
          Password
        </label>

        <div className="relative mt-1">
          <input
            type={showPassword ? "text" : "password"}
            id="password"
            {...register("password")}
            className="h-12 w-full rounded-md border border-gray-200 bg-white p-3 pr-14 text-sm text-gray-700 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? "password-error" : undefined}
          />

          <button
            type="button"
            onClick={() => setShowPassword((current) => !current)}
            className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
          >
            {showPassword ? (
              <FiEyeOff className="h-5 w-5" />
            ) : (
              <FiEye className="h-5 w-5" />
            )}
          </button>
        </div>

        {errors.password && (
          <p
            id="password-error"
            className="mt-1 text-sm text-red-500"
            role="alert"
          >
            {errors.password.message}
          </p>
        )}
      </div>

      {/* SUBMIT */}
      <button
        type="submit"
        disabled={loading}
        className="col-span-6 rounded-md border border-blue-600 bg-blue-600 px-12 py-3 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Logging in..." : "Log In"}
      </button>
    </form>
  );
}