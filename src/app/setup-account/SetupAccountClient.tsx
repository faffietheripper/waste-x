"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState } from "react";
import { FiLock, FiAlertTriangle, FiCheckCircle } from "react-icons/fi";
import { completeInviteAction } from "@/modules/team/actions/completeInviteAction";

export default function SetupAccountClient() {
  const params = useSearchParams();
  const router = useRouter();

  const token = params.get("token");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setError(null);
    setSuccess(false);

    if (!token) {
      setError("Invalid or missing invite token.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    const res = await completeInviteAction({ token, password });

    setLoading(false);

    if (res.success) {
      setSuccess(true);

      setTimeout(() => {
        router.push("/login");
      }, 900);

      return;
    }

    setError(res.message);
  };

  if (error === "Invite link has expired.") {
    return (
      <div className="min-h-screen bg-[#0f0f0f] text-white flex items-center justify-center px-6">
        <div className="w-full max-w-md rounded-3xl border border-orange-500/20 bg-[#151515] p-8 text-center shadow-2xl">
          <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-orange-500/10 text-3xl text-orange-400">
            <FiAlertTriangle />
          </div>

          <p className="text-xs uppercase tracking-[0.25em] text-orange-400">
            Invite Expired
          </p>

          <h1 className="mt-3 text-2xl font-semibold">
            This invite is no longer valid
          </h1>

          <p className="mt-3 text-sm text-white/50">
            Please ask your organisation administrator to send you a new invite.
          </p>

          <button
            onClick={() => router.push("/login")}
            className="mt-6 w-full rounded-xl bg-orange-500 py-3 text-sm font-semibold text-black hover:bg-orange-400 transition"
          >
            Return to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white flex items-center justify-center px-6">
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-[#151515] p-8 shadow-2xl">
        <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-orange-500/20 blur-3xl" />

        <div className="relative">
          <div className="mb-6 grid h-16 w-16 place-items-center rounded-2xl bg-orange-500 text-3xl text-black">
            <FiLock />
          </div>

          <p className="text-xs uppercase tracking-[0.25em] text-orange-400">
            Waste X Onboarding
          </p>

          <h1 className="mt-3 text-3xl font-semibold">
            Complete Account Setup
          </h1>

          <p className="mt-3 text-sm text-white/50">
            Set your password to activate your account and access your assigned
            organisation departments.
          </p>

          {success && (
            <div className="mt-6 flex gap-3 rounded-2xl border border-green-500/20 bg-green-500/10 p-4 text-sm text-green-300">
              <FiCheckCircle className="mt-0.5 shrink-0" />
              <span>Account activated. Redirecting to login...</span>
            </div>
          )}

          {error && (
            <div className="mt-6 flex gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
              <FiAlertTriangle className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="text-sm text-white/70">Password</label>
              <input
                type="password"
                placeholder="Minimum 8 characters"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-orange-500"
              />
            </div>

            <div>
              <label className="text-sm text-white/70">Confirm Password</label>
              <input
                type="password"
                placeholder="Re-enter password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-orange-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading || success}
              className="w-full rounded-xl bg-orange-500 py-3 text-sm font-semibold text-black transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Activating account..." : "Activate Account"}
            </button>
          </form>

          <p className="mt-5 text-center text-xs text-white/30">
            Your access is controlled by your organisation role and assigned
            department permissions.
          </p>
        </div>
      </div>
    </div>
  );
}
