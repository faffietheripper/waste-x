"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { resolveIncidentAction } from "@/modules/incidents/actions/resolveIncidentAction";
import { useAction } from "@/lib/actions/useAction";

interface Props {
  incidentId: string;
  assignmentId: string;
}

type Message = {
  type: "success" | "error";
  text: string;
};

export default function IncidentResolutionForm({
  incidentId,
  assignmentId,
}: Props) {
  const [form, setForm] = useState({
    findings: "",
    correctiveActions: "",
    preventativeMeasures: "",
    complianceReview: "",
    responsiblePerson: "",
    dateClosed: "",
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const run = useAction();
  const router = useRouter();

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    setForm((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));

    setMessage(null);
  }

  function validate(): string | null {
    if (!form.findings.trim()) return "Investigation findings are required.";
    if (!form.correctiveActions.trim())
      return "Corrective actions are required.";
    if (!form.preventativeMeasures.trim())
      return "Preventative measures are required.";
    if (!form.complianceReview.trim()) return "Compliance review is required.";
    if (!form.responsiblePerson.trim())
      return "Responsible person is required.";
    if (!form.dateClosed) return "Date closed is required.";

    return null;
  }

  async function handleResolve() {
    if (loading) return;

    const validationError = validate();

    if (validationError) {
      setMessage({
        type: "error",
        text: validationError,
      });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const result = await run(() =>
        resolveIncidentAction({
          incidentId,
          assignmentId,
          investigationFindings: form.findings,
          correctiveActions: form.correctiveActions,
          preventativeMeasures: form.preventativeMeasures,
          complianceReview: form.complianceReview,
          responsiblePerson: form.responsiblePerson,
          dateClosed: form.dateClosed,
        }),
      );

      if (!result?.success) {
        throw new Error(result?.message || "Failed to resolve incident.");
      }

      setMessage({
        type: "success",
        text: result.message || "Incident resolved successfully.",
      });

      setTimeout(() => {
        router.refresh();
      }, 800);
    } catch (err: any) {
      console.error(err);

      setMessage({
        type: "error",
        text: err.message || "Failed to resolve incident.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white border rounded-2xl p-6 space-y-4">
      <div>
        <h3 className="font-semibold text-lg">Incident Resolution Report</h3>
        <p className="text-sm text-gray-500 mt-1">
          Complete the review details before closing this incident.
        </p>
      </div>

      {message && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            message.type === "success"
              ? "bg-green-50 border-green-200 text-green-700"
              : "bg-red-50 border-red-200 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      <textarea
        name="findings"
        value={form.findings}
        placeholder="Investigation Findings"
        className="w-full border rounded p-2 text-sm"
        rows={3}
        onChange={handleChange}
      />

      <textarea
        name="correctiveActions"
        value={form.correctiveActions}
        placeholder="Corrective Actions Implemented"
        className="w-full border rounded p-2 text-sm"
        rows={3}
        onChange={handleChange}
      />

      <textarea
        name="preventativeMeasures"
        value={form.preventativeMeasures}
        placeholder="Preventative Measures"
        className="w-full border rounded p-2 text-sm"
        rows={3}
        onChange={handleChange}
      />

      <textarea
        name="complianceReview"
        value={form.complianceReview}
        placeholder="Compliance Review"
        className="w-full border rounded p-2 text-sm"
        rows={3}
        onChange={handleChange}
      />

      <input
        name="responsiblePerson"
        value={form.responsiblePerson}
        placeholder="Responsible Person for Closure"
        className="w-full border rounded p-2 text-sm"
        onChange={handleChange}
      />

      <input
        type="date"
        name="dateClosed"
        value={form.dateClosed}
        className="w-full border rounded p-2 text-sm"
        onChange={handleChange}
      />

      <button
        onClick={handleResolve}
        disabled={loading}
        className="w-full px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
      >
        {loading ? "Resolving..." : "Resolve Incident"}
      </button>
    </div>
  );
}
