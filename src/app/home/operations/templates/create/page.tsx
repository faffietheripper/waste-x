"use client";

import { useState } from "react";
import Cr
import { useRouter } from "next/navigation";

export default function CreateTemplatePage() {
  const [name, setName] = useState("");
  const router = useRouter();

  async function handleCreate() {
    const template = await createTemplate(name);
    router.push(`/home/team-dashboard/template-library/${template.id}`);
  }

  return (
    <div className="p-10 max-w-xl">
      <h1 className="text-xl font-semibold mb-6">Create Template</h1>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Template name"
        className="w-full border p-3 mb-4"
      />

      <button onClick={handleCreate} className="bg-black text-white px-6 py-2">
        Create
      </button>
    </div>
  );
}
