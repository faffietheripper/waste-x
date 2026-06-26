"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useAction } from "@/lib/actions/useAction";
import { createDepartmentAction } from "./actions";

/* =========================================================
   TYPES
========================================================= */

type DepartmentType = "generator" | "manager" | "carrier" | "compliance";

type ActionResult = {
  success: boolean;
  message: string;
};

/* =========================================================
   HELPERS
========================================================= */

function formatType(value: DepartmentType) {
  switch (value) {
    case "generator":
      return "Generator";

    case "manager":
      return "Manager";

    case "carrier":
      return "Carrier / Logistics";

    case "compliance":
      return "Compliance";

    default:
      return value;
  }
}

/* =========================================================
   COMPONENT
========================================================= */

export default function CreateDepartmentForm({
  canManageDepartments,
  canCreateAnotherDepartment,
  availableTypesToCreate,
  hasReachedDepartmentLimit,
}: {
  canManageDepartments: boolean;
  canCreateAnotherDepartment: boolean;
  availableTypesToCreate: DepartmentType[];
  hasReachedDepartmentLimit: boolean;
}) {
  const formRef = useRef<HTMLFormElement | null>(null);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<ActionResult | null>(null);

  const run = useAction();
  const router = useRouter();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading) return;

    const formData = new FormData(event.currentTarget);

    setLoading(true);
    setMessage(null);

    try {
      const result = (await run(() =>
        createDepartmentAction(formData),
      )) as ActionResult | null;

      if (!result) {
        setMessage({
          success: false,
          message: "No response was returned. Please try again.",
        });

        return;
      }

      setMessage(result);

      if (result.success) {
        formRef.current?.reset();
        router.refresh();
      }
    } catch (error: any) {
      console.error("Create department error:", error);

      setMessage({
        success: false,
        message:
          error?.message ||
          "Something went wrong while creating the department.",
      });
    } finally {
      setLoading(false);
    }
  }

  if (!canManageDepartments) {
    return (
      <ReadOnlyBox text="Only organisation administrators can create new departments." />
    );
  }

  if (!canCreateAnotherDepartment) {
    return (
      <ReadOnlyBox
        text={
          hasReachedDepartmentLimit
            ? "All manageable department types already exist. You cannot create more than one department per type."
            : "All recommended department types already exist. There are no missing department types to create."
        }
      />
    );
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="mt-6 space-y-5">
      {message && (
        <div
          className={`rounded-2xl border p-4 text-sm leading-6 ${
            message.success
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {message.message}
        </div>
      )}

      <div>
        <label className="text-sm font-semibold text-black">
          Department Name
        </label>

        <input
          required
          name="name"
          disabled={loading}
          placeholder="e.g. Manager Operations"
          className="mt-2 w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm text-black outline-none transition placeholder:text-black/30 focus:border-orange-500 focus:bg-white disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>

      <div>
        <label className="text-sm font-semibold text-black">
          Department Type
        </label>

        <select
          required
          name="type"
          defaultValue=""
          disabled={loading}
          className="mt-2 w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm text-black outline-none transition focus:border-orange-500 focus:bg-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          <option value="" disabled>
            Select department type
          </option>

          {availableTypesToCreate.map((type) => (
            <option key={type} value={type}>
              {formatType(type)}
            </option>
          ))}
        </select>

        <p className="mt-2 text-xs leading-5 text-black/40">
          Existing department types are hidden to prevent duplicates.
        </p>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:bg-black/20 disabled:text-black/40"
      >
        {loading ? "Creating..." : "Create Department"}
      </button>
    </form>
  );
}

/* =========================================================
   SMALL COMPONENTS
========================================================= */

function ReadOnlyBox({ text }: { text: string }) {
  return (
    <div className="mt-6 rounded-2xl border border-dashed border-black/20 bg-[#fbfaf7] p-5 text-sm leading-6 text-black/45">
      {text}
    </div>
  );
}