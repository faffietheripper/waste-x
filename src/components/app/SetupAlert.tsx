"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function SetupAlert({
  user,
}: {
  user: { role?: string | null; profileCompleted?: boolean };
}) {
  const [showAlert, setShowAlert] = useState(false);
  const router = useRouter();

  useEffect(() => {
    console.log("👀 useEffect ran", { user });
    if (!user?.role || !user?.profileCompleted) {
      console.log("🚨 Missing setup info — showing alert");
      setShowAlert(true);
    } else {
      console.log("✅ User setup complete — hiding alert");
      setShowAlert(false);
    }
  }, [user]);

  console.log("👀 SetupAlert render", { showAlert, user });

  if (!showAlert) return null;

  // 👇 Put your debugged handler here
  const handleGoToSettings = () => {
    console.log("⚠️ handleGoToSettings fired!");
    setShowAlert(false);
    router.push("/home/settings");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-yellow-100 border-l-8 border-yellow-600 text-yellow-900 p-6 rounded-2xl shadow-2xl max-w-md w-[90%] text-center animate-fadeIn relative">
        <button
          onClick={() => {
            console.log("❌ Closed manually");
            setShowAlert(false);
          }}
          className="absolute top-3 right-3 text-yellow-800 hover:text-yellow-600"
        >
          ✕
        </button>

        <h2 className="font-bold text-lg mb-2">System Notice</h2>
        <p className="text-sm mb-4">
          Your profile has not been completed. You will have limited access to
          the system until your setup is finished. If you are the company admin,
          please complete your profile first and then set up your organisation.
        </p>

        <button
          onClick={handleGoToSettings}
          className="inline-block bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-md font-medium transition"
        >
          Go to Settings →
        </button>
      </div>
    </div>
  );
}
