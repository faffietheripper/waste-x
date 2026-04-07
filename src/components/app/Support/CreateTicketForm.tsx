"use client";

import { useState } from "react";
import { createTicketAction } from "@/app/home/support/action";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/use-toast";
import { useAction } from "@/lib/actions/useAction";

export default function CreateTicketForm({
  organisationId,
}: {
  organisationId: string;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const run = useAction();

  const [category, setCategory] = useState("technical");
  const [priority, setPriority] = useState("medium");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!message.trim() || isSubmitting) return;

    setIsSubmitting(true);

    const formData = new FormData();
    formData.append("category", category);
    formData.append("priority", priority);
    formData.append("message", message);

    const result = await run(() => createTicketAction(null, formData));

    setIsSubmitting(false);

    if (!result) return; // error handled globally

    if (result.success) {
      toast({ title: "Ticket created" });
      router.push(`/home/support/${result.ticketId}`);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white p-6 rounded-2xl shadow border space-y-6 max-w-2xl"
    >
      <div className="space-y-2">
        <label className="text-sm font-medium">Category</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm"
        >
          <option value="technical">Technical Issue</option>
          <option value="billing">Billing</option>
          <option value="compliance">Compliance</option>
          <option value="account">Account</option>
          <option value="other">Other</option>
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Priority</label>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm"
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Describe the issue</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={6}
          className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
          placeholder="Explain the issue in detail..."
        />
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg transition"
        >
          {isSubmitting ? "Creating..." : "Create Ticket"}
        </button>
      </div>
    </form>
  );
}
