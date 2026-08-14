"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type GlobalErrorPayload =
  | {
      title?: string;
      message: string;
      description?: string;
      code?: string;
    }
  | string
  | null;

type NormalisedGlobalError = {
  title: string;
  message: string;
  description?: string;
  code?: string;
} | null;

type ErrorContextValue = {
  error: NormalisedGlobalError;
  globalError: NormalisedGlobalError;
  errors: NormalisedGlobalError[];

  setError: (error: GlobalErrorPayload) => void;
  showError: (error: GlobalErrorPayload) => void;
  reportError: (error: unknown, fallbackMessage?: string) => void;

  clearError: () => void;
  dismissError: () => void;
  clearErrors: () => void;

  addError: (error: GlobalErrorPayload) => void;
  removeError: () => void;
};

const ErrorContext = createContext<ErrorContextValue | undefined>(undefined);

function normaliseError(error: GlobalErrorPayload): NormalisedGlobalError {
  if (!error) return null;

  if (typeof error === "string") {
    return {
      title: "Something went wrong",
      message: error,
    };
  }

  return {
    title: error.title ?? "Something went wrong",
    message: error.message,
    description: error.description,
    code: error.code,
  };
}

export function ErrorProvider({ children }: { children: ReactNode }) {
  const [error, setErrorState] = useState<NormalisedGlobalError>(null);

  const setError = useCallback((nextError: GlobalErrorPayload) => {
    setErrorState(normaliseError(nextError));
  }, []);

  const showError = useCallback((nextError: GlobalErrorPayload) => {
    setErrorState(normaliseError(nextError));
  }, []);

  const reportError = useCallback(
    (nextError: unknown, fallbackMessage = "An unexpected error occurred.") => {
      if (nextError instanceof Error) {
        setErrorState({
          title: "Something went wrong",
          message: nextError.message || fallbackMessage,
        });

        return;
      }

      if (typeof nextError === "string") {
        setErrorState({
          title: "Something went wrong",
          message: nextError,
        });

        return;
      }

      setErrorState({
        title: "Something went wrong",
        message: fallbackMessage,
      });
    },
    [],
  );

  const clearError = useCallback(() => {
    setErrorState(null);
  }, []);

  const value = useMemo<ErrorContextValue>(
    () => ({
      error,
      globalError: error,
      errors: error ? [error] : [],

      setError,
      showError,
      reportError,

      clearError,
      dismissError: clearError,
      clearErrors: clearError,

      addError: setError,
      removeError: clearError,
    }),
    [clearError, error, reportError, setError, showError],
  );

  return <ErrorContext.Provider value={value}>{children}</ErrorContext.Provider>;
}

export function useError() {
  const context = useContext(ErrorContext);

  if (!context) {
    return {
      error: null,
      globalError: null,
      errors: [],

      setError: () => undefined,
      showError: () => undefined,
      reportError: () => undefined,

      clearError: () => undefined,
      dismissError: () => undefined,
      clearErrors: () => undefined,

      addError: () => undefined,
      removeError: () => undefined,
    } satisfies ErrorContextValue;
  }

  return context;
}