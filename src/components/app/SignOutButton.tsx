"use client";

import { signOut } from "next-auth/react";

export default function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/" })}
      className="rounded-full border border-black/10 bg-white px-5 py-2.5 text-sm font-semibold text-black/60 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700"
    >
      Sign Out
    </button>
  );
}
