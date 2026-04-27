"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { markCollectedAction } from "@/modules/assignments/actions/markCollectedAction";

export default function VerificationPanel({
  assignmentId,
}: {
  assignmentId: string;
}) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleVerify() {
    if (!code.trim() || loading) return;

    setLoading(true);

    try {
      const result = await markCollectedAction({
        assignmentId,
        verificationCode: code.trim(),
      });

      if (!result?.success) {
        throw new Error(result?.message || "Verification failed");
      }

      alert("Collection verified successfully");
      router.refresh();
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Failed to verify collection");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white border rounded-xl p-4">
      <h3 className="font-semibold mb-2">Verification</h3>

      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Enter verification code"
        className="border p-2 rounded w-full mb-2"
      />

      <button
        onClick={handleVerify}
        disabled={loading}
        className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
      >
        {loading ? "Verifying..." : "Verify Collection"}
      </button>
    </div>
  );
}
