"use client";

import { useState } from "react";

export default function ArchiveButton({
  handleArchive,
}: {
  handleArchive: () => Promise<void> | void;
}) {
  const [loading, setLoading] = useState(false);

  async function onClick() {
    if (loading) return;

    setLoading(true);

    try {
      await handleArchive();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="bg-gray-600 py-2 px-4 rounded-md w-full text-white disabled:opacity-50"
    >
      {loading ? "Archiving..." : "Archive"}
    </button>
  );
}
