"use client";

import { useEffect, useState } from "react";

export default function WorksheetToast({
  type,
  message,
}: {
  type: "success" | "error" | null;
  message: string;
}) {
  const [visible, setVisible] = useState(Boolean(type && message));

  useEffect(() => {
    setVisible(Boolean(type && message));

    // Success confirmations can get out of the operator's way automatically.
    // Errors deliberately stay visible until dismissed.
    if (type !== "success" || !message) return;

    const timer = window.setTimeout(() => setVisible(false), 4500);
    return () => window.clearTimeout(timer);
  }, [type, message]);

  if (!type || !message || !visible) return null;

  const isError = type === "error";

  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      className="pointer-events-none fixed right-5 top-5 z-[9999] w-[min(440px,calc(100vw-40px))]"
    >
      <div
        className={`pointer-events-auto overflow-hidden rounded-2xl border shadow-2xl backdrop-blur ${
          isError
            ? "border-red-200 bg-red-50/95 text-red-900"
            : "border-emerald-200 bg-emerald-50/95 text-emerald-900"
        }`}
      >
        <div
          className={`h-1 w-full ${
            isError ? "bg-red-600" : "bg-emerald-600"
          }`}
        />

        <div className="flex items-start gap-3 p-4">
          <div
            className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-black ${
              isError
                ? "bg-red-600 text-white"
                : "bg-emerald-600 text-white"
            }`}
          >
            {isError ? "!" : "✓"}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] opacity-55">
              {isError ? "Action needed" : "Updated"}
            </p>
            <p className="mt-1 text-sm font-semibold leading-5">{message}</p>

            {isError && (
              <p className="mt-1.5 text-xs leading-5 opacity-60">
                Fix the highlighted load information, then try the action again.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => setVisible(false)}
            aria-label="Dismiss notification"
            className="flex size-7 shrink-0 items-center justify-center rounded-lg text-base font-semibold opacity-45 hover:bg-black/5 hover:opacity-100"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
