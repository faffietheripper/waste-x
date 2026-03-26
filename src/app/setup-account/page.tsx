"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState } from "react";
import { completeInvite } from "./actions";

export default function SetupAccountPage() {
  const params = useSearchParams();
  const router = useRouter();

  const token = params.get("token");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setError(null);

    if (!token) {
      setError("Invalid or missing invite token.");
      return;
    }

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    const res = await completeInvite({ token, password });

    setLoading(false);

    if (res.success) {
      router.push("/login");
    } else {
      setError(res.message);
    }
  };

  /* ===============================
     EXPIRED STATE
  ============================== */

  if (error === "Invite link has expired.") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white px-6">
        <div className="border border-neutral-800 bg-neutral-950 p-8 max-w-md text-center">
          <h1 className="text-xl font-semibold mb-4">Invite Expired</h1>

          <p className="text-sm text-neutral-400 mb-6">
            This invite link is no longer valid. Please contact your
            organisation administrator to request a new invitation.
          </p>

          <button
            onClick={() => router.push("/login")}
            className="w-full bg-orange-500 text-black py-2 text-sm font-medium hover:bg-orange-600 transition"
          >
            Return to Login
          </button>
        </div>
      </div>
    );
  }

  /* ===============================
     DEFAULT FORM
  ============================== */

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-6">
      <div className="w-full max-w-md border border-neutral-800 bg-neutral-950 p-8">
        {/* Header */}
        <h1 className="text-2xl font-semibold mb-2">Complete Account Setup</h1>

        <p className="text-sm text-neutral-400 mb-6">
          Set your password to activate your Waste X account.
        </p>

        {/* Error */}
        {error && (
          <div className="mb-4 text-sm border border-red-500 text-red-500 p-2">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            placeholder="Password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-black border border-neutral-700 p-2 text-sm focus:border-orange-500 focus:outline-none"
          />

          <input
            type="password"
            placeholder="Confirm Password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full bg-black border border-neutral-700 p-2 text-sm focus:border-orange-500 focus:outline-none"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-orange-500 text-black py-2 text-sm font-medium hover:bg-orange-600 transition disabled:opacity-50"
          >
            {loading ? "Activating..." : "Activate Account"}
          </button>
        </form>

        {/* Footer */}
        <p className="text-xs text-neutral-600 mt-6">
          ACCESS POINT // WX-SETUP-01
        </p>
      </div>
    </div>
  );
}
