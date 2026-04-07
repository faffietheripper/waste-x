"use client";

import { createContext, useContext, useState } from "react";

type ErrorState = {
  message: string;
  errorId?: string;
};

type ErrorContextType = {
  error: ErrorState | null;
  setError: (error: ErrorState | null) => void;
};

const ErrorContext = createContext<ErrorContextType | null>(null);

export function ErrorProvider({ children }: { children: React.ReactNode }) {
  const [error, setError] = useState<ErrorState | null>(null);

  return (
    <ErrorContext.Provider value={{ error, setError }}>
      {children}
    </ErrorContext.Provider>
  );
}

export function useError() {
  const ctx = useContext(ErrorContext);
  if (!ctx) throw new Error("useError must be used inside ErrorProvider");
  return ctx;
}
