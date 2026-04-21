"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createTemplateAction } from "@/modules/templates/actions/templateActions";

export default function CreateTemplatePage() {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const router = useRouter();

  async function handleCreate() {
    if (!name.trim() || loading) return;

    setLoading(true);

    try {
      const template = await createTemplateAction(name);

      // ✅ NO success / data — raw object
      if (!template?.id) {
        throw new Error("Failed to create template");
      }

      router.push(`/home/operations/templates/${template.id}`);
    } catch (err) {
      console.error("Create template error:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pl-[24vw] mt-32 p-10 max-w-xl">
      <h1 className="text-xl font-semibold mb-6">Create Template</h1>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Template name"
        className="w-full border p-3 mb-4"
      />

      <button
        onClick={handleCreate}
        disabled={loading}
        className="bg-black text-white px-6 py-2 disabled:opacity-50"
      >
        {loading ? "Creating..." : "Create"}
      </button>
    </div>
  );
}
