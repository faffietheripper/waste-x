"use client";

import { useState } from "react";
import { createTicketAction } from "@/app/home/support/action";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/use-toast";
import { useAction } from "@/lib/actions/useAction";

/* =========================================================
   TYPES
========================================================= */

type TicketCategory =
  | "bug"
  | "billing"
  | "access"
  | "feature_request"
  | "compliance"
  | "other";

type TicketPriority = "low" | "medium" | "high" | "urgent";

type Message = {
  type: "success" | "error";
  text: string;
};

/* =========================================================
   OPTIONS
========================================================= */

const categoryOptions: {
  value: TicketCategory;
  label: string;
  description: string;
}[] = [
  {
    value: "bug",
    label: "Bug / Technical Issue",
    description: "Something is broken, failing, or behaving unexpectedly.",
  },
  {
    value: "access",
    label: "Access / Permissions",
    description: "Login, organisation, department, user or visibility issue.",
  },
  {
    value: "compliance",
    label: "Compliance",
    description:
      "Incident, audit, report, chain-of-custody or verification issue.",
  },
  {
    value: "billing",
    label: "Billing",
    description: "Subscription, invoice, payment or plan question.",
  },
  {
    value: "feature_request",
    label: "Feature Request",
    description: "Request a new workflow, improvement or platform capability.",
  },
  {
    value: "other",
    label: "Other",
    description: "General support request.",
  },
];

const priorityOptions: {
  value: TicketPriority;
  label: string;
  description: string;
}[] = [
  {
    value: "low",
    label: "Low",
    description: "General question or non-urgent request.",
  },
  {
    value: "medium",
    label: "Medium",
    description: "Normal support request that should be reviewed.",
  },
  {
    value: "high",
    label: "High",
    description: "Important issue affecting work or workflow confidence.",
  },
  {
    value: "urgent",
    label: "Urgent",
    description: "Critical issue blocking operations, access or compliance.",
  },
];

/* =========================================================
   HELPERS
========================================================= */

function getPriorityClass(priority: TicketPriority) {
  switch (priority) {
    case "urgent":
      return "border-red-300 bg-red-100 text-red-700";

    case "high":
      return "border-orange-300 bg-orange-100 text-orange-700";

    case "medium":
      return "border-yellow-300 bg-yellow-100 text-yellow-700";

    case "low":
      return "border-green-300 bg-green-100 text-green-700";

    default:
      return "border-gray-300 bg-gray-100 text-gray-700";
  }
}

/* =========================================================
   COMPONENT
========================================================= */

export default function CreateTicketForm({
  organisationId,
}: {
  organisationId: string;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const run = useAction();

  const [category, setCategory] = useState<TicketCategory>("bug");
  const [priority, setPriority] = useState<TicketPriority>("medium");
  const [message, setMessage] = useState("");
  const [localMessage, setLocalMessage] = useState<Message | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedCategory = categoryOptions.find(
    (option) => option.value === category,
  );

  const selectedPriority = priorityOptions.find(
    (option) => option.value === priority,
  );

  const canSubmit = message.trim().length >= 10 && !isSubmitting;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!canSubmit) {
      setLocalMessage({
        type: "error",
        text: "Please describe the issue in at least 10 characters.",
      });

      return;
    }

    setIsSubmitting(true);
    setLocalMessage(null);

    try {
      const formData = new FormData();

      formData.append("category", category);
      formData.append("priority", priority);
      formData.append("message", message.trim());

      /*
        Keeping your existing server action call style.
        organisationId is passed as prop for UI context, but the server action
        should still derive organisation from the authenticated user for safety.
      */
      const result = await run(() => createTicketAction(null, formData));

      if (!result?.success) {
        throw new Error(result?.message || "Failed to create ticket.");
      }

      toast({
        title: "Ticket created",
        description: "Your support ticket has been created successfully.",
      });

      setLocalMessage({
        type: "success",
        text: "Ticket created successfully. Redirecting...",
      });

      router.push(`/home/support/${result.ticketId}`);
    } catch (error: any) {
      console.error("Create ticket error:", error);

      setLocalMessage({
        type: "error",
        text:
          error?.message ||
          "Failed to create support ticket. Please try again.",
      });

      toast({
        title: "Ticket failed",
        description:
          error?.message ||
          "Failed to create support ticket. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-3xl border border-black/10 bg-white p-8 shadow-sm"
    >
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
          New Ticket
        </p>

        <h2 className="mt-2 text-2xl font-semibold text-black">
          Support Request Details
        </h2>

        <p className="mt-2 text-sm leading-6 text-black/45">
          Your ticket will be attached to this organisation and visible to the
          relevant support workflow.
        </p>

        <div className="mt-5 rounded-2xl border border-black/10 bg-[#fbfaf7] p-4">
          <p className="text-xs uppercase tracking-widest text-black/35">
            Organisation ID
          </p>

          <p className="mt-2 break-all font-mono text-xs text-black/60">
            {organisationId}
          </p>
        </div>
      </div>

      {localMessage && (
        <div
          className={`mb-6 rounded-2xl border p-4 text-sm ${
            localMessage.type === "success"
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {localMessage.text}
        </div>
      )}

      <div className="space-y-8">
        {/* CATEGORY */}
        <section>
          <label className="text-sm font-semibold text-black">Category</label>

          <select
            value={category}
            onChange={(event) =>
              setCategory(event.target.value as TicketCategory)
            }
            className="mt-2 w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm text-black outline-none transition focus:border-orange-500 focus:bg-white"
          >
            {categoryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {selectedCategory && (
            <div className="mt-3 rounded-2xl border border-orange-100 bg-orange-50 p-4 text-sm leading-6 text-orange-800">
              {selectedCategory.description}
            </div>
          )}
        </section>

        {/* PRIORITY */}
        <section>
          <label className="text-sm font-semibold text-black">Priority</label>

          <select
            value={priority}
            onChange={(event) =>
              setPriority(event.target.value as TicketPriority)
            }
            className="mt-2 w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm text-black outline-none transition focus:border-orange-500 focus:bg-white"
          >
            {priorityOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {selectedPriority && (
            <div className="mt-3 flex items-start justify-between gap-4 rounded-2xl border border-black/10 bg-[#fbfaf7] p-4">
              <div>
                <p className="text-sm font-semibold text-black">
                  {selectedPriority.label} priority
                </p>

                <p className="mt-1 text-sm leading-6 text-black/45">
                  {selectedPriority.description}
                </p>
              </div>

              <span
                className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${getPriorityClass(
                  priority,
                )}`}
              >
                {selectedPriority.label}
              </span>
            </div>
          )}
        </section>

        {/* MESSAGE */}
        <section>
          <label className="text-sm font-semibold text-black">
            Describe the issue
          </label>

          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={8}
            className="mt-2 w-full resize-none rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm leading-6 text-black outline-none transition placeholder:text-black/30 focus:border-orange-500 focus:bg-white"
            placeholder="Explain what happened, where it happened, what you expected, and whether it blocks operations..."
          />

          <div className="mt-2 flex items-center justify-between gap-4">
            <p className="text-xs text-black/35">
              Minimum 10 characters. More detail helps support resolve the issue
              faster.
            </p>

            <p className="text-xs text-black/35">{message.length} characters</p>
          </div>
        </section>

        {/* ACTIONS */}
        <div className="flex items-center justify-between gap-5 border-t border-black/5 pt-6">
          <p className="text-xs leading-5 text-black/40">
            Support tickets are organisation records and may be visible to
            authorised team members.
          </p>

          <button
            type="submit"
            disabled={!canSubmit}
            className={`rounded-full px-6 py-3 text-sm font-semibold transition ${
              canSubmit
                ? "bg-orange-500 text-black hover:bg-orange-400"
                : "cursor-not-allowed bg-black/10 text-black/35"
            }`}
          >
            {isSubmitting ? "Creating..." : "Create Ticket"}
          </button>
        </div>
      </div>
    </form>
  );
}
