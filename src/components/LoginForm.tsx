"use client";

import { useEffect, useRef, useState } from "react";
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

type LoginNotice = {
  title: string;
  message: string;
  tone: "warning" | "error" | "info";
};

/* =========================================================
   LOGIN REASON MESSAGES
========================================================= */

const loginReasonMessages: Record<string, LoginNotice> = {
  "session-replaced": {
    title: "You were signed out",
    message:
      "This account was used on another device, so this session was ended for security.",
    tone: "warning",
  },
  "session-invalid": {
    title: "Session expired",
    message: "Please sign in again to continue.",
    tone: "info",
  },
  "account-disabled": {
    title: "Account unavailable",
    message:
      "This account is inactive or suspended. Please contact your organisation administrator.",
    tone: "error",
  },
};

/* =========================================================
   COMPONENT
========================================================= */

export default function LoginForm() {
  const router = useRouter();

  const [serverError, setServerError] = useState<string | null>(null);
  const [loginNotice, setLoginNotice] = useState<LoginNotice | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const errorContainerRef = useRef<HTMLDivElement | null>(null);

  const {
    register,
    handleSubmit,
    resetField,
    setFocus,
    formState: { errors },
  } = useForm<LoginFormInputs>({
    resolver: zodResolver(LoginSchema),
    mode: "onSubmit",
  });

  /* =========================================================
     READ LOGIN REASON FROM URL
  ========================================================= */

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const reason = searchParams.get("reason");

    if (!reason) return;

    const notice = loginReasonMessages[reason];

    if (!notice) return;

    setLoginNotice(notice);
  }, []);

  function clearMessages() {
    if (serverError) setServerError(null);
    if (loginNotice) setLoginNotice(null);
  }

  /* =========================================================
     SUBMIT
  ========================================================= */

  const onSubmit = async (data: LoginFormInputs) => {
    if (loading) return;

    setServerError(null);
    setLoading(true);

    try {
      const res = await login(data);

      if (!res?.success) {
        setServerError(
          res?.message ||
            "The email or password you entered is incorrect. Please try again.",
        );

        resetField("password");

        window.setTimeout(() => {
          errorContainerRef.current?.focus();
          setFocus("password");
        }, 50);

        router.refresh();

        return;
      }

      if (res.data?.role === "platform_admin") {
        router.replace("/admin");
        return;
      }

      router.replace("/home");
    } catch (error) {
      console.error("[LOGIN_FORM_ERROR]", error);

      setServerError(
        "Login failed. Please check your email and password, then try again.",
      );

      resetField("password");

      window.setTimeout(() => {
        errorContainerRef.current?.focus();
        setFocus("password");
      }, 50);

      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  /* =========================================================
     UI
  ========================================================= */

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="mt-8 grid grid-cols-6 gap-6"
      noValidate
    >
      {/* SESSION / SECURITY NOTICE */}
      {loginNotice && (
        <div
          className={`col-span-6 rounded-xl border p-4 text-sm outline-none ${
            loginNotice.tone === "error"
              ? "border-red-500/40 bg-red-500/10 text-red-200"
              : loginNotice.tone === "warning"
                ? "border-orange-500/40 bg-orange-500/10 text-orange-100"
                : "border-blue-500/40 bg-blue-500/10 text-blue-100"
          }`}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-semibold">{loginNotice.title}</p>

              <p className="mt-1 leading-6 opacity-80">
                {loginNotice.message}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setLoginNotice(null)}
              className="shrink-0 rounded-full border border-white/10 px-3 py-1 text-xs font-semibold opacity-70 transition hover:bg-white/10 hover:opacity-100"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* SERVER ERROR */}
      {serverError && (
        <div
          ref={errorContainerRef}
          tabIndex={-1}
          className="col-span-6 rounded-xl border border-red-400 bg-red-100 p-4 text-sm font-semibold text-red-700 outline-none"
          role="alert"
          aria-live="assertive"
        >
          {serverError}
        </div>
      )}

      {/* EMAIL */}
      <div className="col-span-6">
        <label
          htmlFor="email"
          className="block text-sm font-medium text-neutral-300"
        >
          Email
        </label>

        <input
          type="email"
          id="email"
          autoComplete="email"
          {...register("email", {
            onChange: clearMessages,
          })}
          className="mt-1 h-12 w-full rounded-md border border-neutral-800 bg-white p-3 text-sm text-gray-700 shadow-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? "email-error" : undefined}
        />

        {errors.email && (
          <p
            id="email-error"
            className="mt-1 text-sm text-red-400"
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
          className="block text-sm font-medium text-neutral-300"
        >
          Password
        </label>

        <div className="relative mt-1">
          <input
            type={showPassword ? "text" : "password"}
            id="password"
            autoComplete="current-password"
            {...register("password", {
              onChange: clearMessages,
            })}
            className="h-12 w-full rounded-md border border-neutral-800 bg-white p-3 pr-14 text-sm text-gray-700 shadow-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10"
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? "password-error" : undefined}
          />

          <button
            type="button"
            onClick={() => setShowPassword((current) => !current)}
            className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
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
            className="mt-1 text-sm text-red-400"
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
        className="col-span-6 rounded-md border border-orange-500 bg-orange-500 px-12 py-3 text-sm font-semibold text-black transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Checking details..." : "Log In"}
      </button>
    </form>
  );
}