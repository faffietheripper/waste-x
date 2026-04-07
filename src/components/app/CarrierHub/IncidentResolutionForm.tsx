"use client";

import { useState, useTransition } from "react";
import { resolveIncidentAction } from "@/app/home/carrier-hub/carrier-manager/incident-management/actions";
import { useAction } from "@/lib/actions/useAction";

interface Props {
  incidentId: string;
  assignmentId: string;
}

export default function IncidentResolutionForm({
  incidentId,
  assignmentId,
}: Props) {
  const [form, setForm] = useState({
    dateOfIncident: "",
    location: "",
    type: "",
    summary: "",
    immediateAction: "",
    findings: "",
    correctiveActions: "",
    preventativeMeasures: "",
    complianceReview: "",
    responsiblePerson: "",
    dateClosed: "",
  });

  const [isPending, startTransition] = useTransition();

  const run = useAction();

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const buildResolutionNotes = () => {
    return `

Date of Incident
${form.dateOfIncident}

Location of Incident
${form.location}

Type of Incident
${form.type}

Summary of Incident
${form.summary}

Immediate Action Taken
${form.immediateAction}

Investigation Findings
${form.findings}

Corrective Actions Implemented
${form.correctiveActions}

Preventative Measures
${form.preventativeMeasures}

Compliance Review
${form.complianceReview}

Responsible Person for Closure
${form.responsiblePerson}

Date Closed
${form.dateClosed}
    `.trim();
  };

  const validate = () => {
    for (const key in form) {
      if (!form[key as keyof typeof form]) {
        // ⚠️ validation = local (no global error)
        return false;
      }
    }
    return true;
  };

  const handleResolve = () => {
    if (!validate()) return;

    const compiledNotes = buildResolutionNotes();

    startTransition(async () => {
      const result = await run(() =>
        resolveIncidentAction(incidentId, assignmentId, compiledNotes),
      );

      // no need to handle error here — global system handles it
      // you could add success UX here later if needed
    });
  };

  return (
    <div className="mt-6 border-t pt-6 space-y-4">
      <h3 className="font-semibold text-lg">Incident Resolution Report</h3>

      <input
        type="date"
        name="dateOfIncident"
        className="w-full border rounded p-2 text-sm"
        onChange={handleChange}
      />

      <input
        name="location"
        placeholder="Location of Incident"
        className="w-full border rounded p-2 text-sm"
        onChange={handleChange}
      />

      <input
        name="type"
        placeholder="Type of Incident"
        className="w-full border rounded p-2 text-sm"
        onChange={handleChange}
      />

      <textarea
        name="summary"
        placeholder="Summary of Incident"
        className="w-full border rounded p-2 text-sm"
        rows={3}
        onChange={handleChange}
      />

      <textarea
        name="immediateAction"
        placeholder="Immediate Action Taken"
        className="w-full border rounded p-2 text-sm"
        rows={3}
        onChange={handleChange}
      />

      <textarea
        name="findings"
        placeholder="Investigation Findings"
        className="w-full border rounded p-2 text-sm"
        rows={3}
        onChange={handleChange}
      />

      <textarea
        name="correctiveActions"
        placeholder="Corrective Actions Implemented"
        className="w-full border rounded p-2 text-sm"
        rows={3}
        onChange={handleChange}
      />

      <textarea
        name="preventativeMeasures"
        placeholder="Preventative Measures"
        className="w-full border rounded p-2 text-sm"
        rows={3}
        onChange={handleChange}
      />

      <textarea
        name="complianceReview"
        placeholder="Compliance Review"
        className="w-full border rounded p-2 text-sm"
        rows={3}
        onChange={handleChange}
      />

      <input
        name="responsiblePerson"
        placeholder="Responsible Person for Closure"
        className="w-full border rounded p-2 text-sm"
        onChange={handleChange}
      />

      <input
        type="date"
        name="dateClosed"
        className="w-full border rounded p-2 text-sm"
        onChange={handleChange}
      />

      <div className="flex gap-4 pt-4">
        <button
          onClick={handleResolve}
          disabled={isPending}
          className="px-4 py-2 bg-green-600 text-white rounded"
        >
          {isPending ? "Processing..." : "Resolve Incident"}
        </button>
      </div>
    </div>
  );
}
