"use client";

import { useError } from "@/components/providers/error-provider";

export function GlobalError() {
  const { error, setError } = useError();

  if (!error) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-sm">
      <div className="bg-red-500 text-white rounded-2xl p-4 shadow-lg">
        <p className="font-medium">{error.message}</p>

        {error.errorId && (
          <p className="text-xs mt-2 opacity-80">Error ID: {error.errorId}</p>
        )}

        <button
          onClick={() => setError(null)}
          className="mt-3 text-xs underline"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
