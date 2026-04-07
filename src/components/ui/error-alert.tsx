"use client";

type Props = {
  message: string;
  errorId?: string;
};

export function ErrorAlert({ message, errorId }: Props) {
  return (
    <div className="w-full rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
      <p className="text-sm text-red-600 font-medium">{message}</p>

      {errorId && (
        <p className="text-xs text-red-400 mt-2">Error ID: {errorId}</p>
      )}
    </div>
  );
}
