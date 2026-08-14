"use client";

import { useError } from "@/components/providers/error-provider";

export function GlobalError() {
  const { error, clearError } = useError();

  if (!error) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-sm">
      <div className="rounded-2xl border border-red-200 bg-red-500 p-4 text-white shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">
              {error.title ?? "Something went wrong"}
            </p>

            <p className="mt-1 text-sm text-white/90">{error.message}</p>

            {error.description && (
              <p className="mt-2 text-xs text-white/75">
                {error.description}
              </p>
            )}

            {error.code && (
              <p className="mt-2 text-xs text-white/70">
                Error code: {error.code}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={clearError}
            className="rounded-full px-2 text-sm font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}

export default GlobalError;