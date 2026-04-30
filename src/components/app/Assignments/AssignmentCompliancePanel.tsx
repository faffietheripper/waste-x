"use client";

import { useState } from "react";
import {
  FiDownload,
  FiAlertTriangle,
  FiCheckCircle,
  FiFileText,
} from "react-icons/fi";

import { downloadAssignmentReportAction } from "@/modules/assignments/actions/downloadAssignmentReportAction";

function formatDate(date: Date | string | null | undefined) {
  if (!date) return "Not yet";
  return new Date(date).toLocaleString();
}

export default function AssignmentCompliancePanel({
  assignment,
}: {
  assignment: any;
}) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);

    const res = await downloadAssignmentReportAction(assignment.id);

    setLoading(false);

    if (!res.success) {
      setError(res.message || "Failed to generate report.");
      return;
    }

    // 🔥 convert base64 → file
    const byteCharacters = atob(res.file);
    const byteNumbers = new Array(byteCharacters.length);

    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }

    const byteArray = new Uint8Array(byteNumbers);

    const blob = new Blob([byteArray], { type: "application/pdf" });

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `WasteX-Audit-${assignment.id}.pdf`;
    a.click();

    URL.revokeObjectURL(url);

    setMessage("Audit report downloaded.");
  };

  return (
    <div className="rounded-2xl border border-black/10 bg-white p-6 space-y-5 shadow-sm">
      {/* HEADER */}
      <div className="flex items-center gap-3">
        <div className="bg-black text-white p-2 rounded-lg">
          <FiFileText />
        </div>

        <div>
          <h3 className="font-semibold text-black">Compliance & Audit</h3>
          <p className="text-xs text-black/50">
            Full traceability and audit-ready data
          </p>
        </div>
      </div>

      {/* STATUS MESSAGES */}
      {message && (
        <div className="flex gap-2 text-sm border border-green-200 bg-green-50 text-green-700 p-3 rounded-xl">
          <FiCheckCircle className="mt-0.5" />
          {message}
        </div>
      )}

      {error && (
        <div className="flex gap-2 text-sm border border-red-200 bg-red-50 text-red-700 p-3 rounded-xl">
          <FiAlertTriangle className="mt-0.5" />
          {error}
        </div>
      )}

      {/* DATA */}
      <div className="space-y-3 text-sm">
        <Row label="Verification Code">
          {assignment.verificationCode ?? "Not generated"}
        </Row>

        <Row label="Assigned">{formatDate(assignment.assignedAt)}</Row>
        <Row label="Accepted">{formatDate(assignment.respondedAt)}</Row>
        <Row label="Collected">{formatDate(assignment.collectedAt)}</Row>
        <Row label="Completed">{formatDate(assignment.completedAt)}</Row>

        <Row label="Incident">
          {assignment.hasIncident ? (
            <span className="text-red-500 font-medium">Yes</span>
          ) : (
            <span className="text-green-600 font-medium">No</span>
          )}
        </Row>
      </div>

      {/* DOWNLOAD */}
      <button
        onClick={handleDownload}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 bg-black text-white py-3 text-sm font-medium rounded-xl hover:bg-gray-800 transition disabled:opacity-50"
      >
        <FiDownload />
        {loading ? "Generating report..." : "Download Audit Report"}
      </button>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex justify-between border-b border-black/5 pb-2">
      <span className="text-black/50">{label}</span>
      <span className="font-medium text-black">{children}</span>
    </div>
  );
}
