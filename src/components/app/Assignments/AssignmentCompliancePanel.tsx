"use client";

import { useState } from "react";
import {
  FiDownload,
  FiAlertTriangle,
  FiCheckCircle,
  FiFileText,
} from "react-icons/fi";

import { downloadAssignmentReportAction } from "@/modules/assignments/actions/downloadAssignmentReportAction";

/* =========================================================
   TYPES
========================================================= */

type AssignmentForCompliancePanel = {
  id: string;
  verificationCode?: string | null;
  assignedAt?: Date | string | null;
  respondedAt?: Date | string | null;
  collectedAt?: Date | string | null;
  completedAt?: Date | string | null;
  hasIncident?: boolean | null;
};

type DownloadReportResult = {
  success?: boolean;
  message?: string;
  file?: string;
};

/* =========================================================
   COMPONENT
========================================================= */

export default function AssignmentCompliancePanel({
  assignment,
}: {
  assignment: AssignmentForCompliancePanel;
}) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    if (loading) return;

    if (!assignment?.id) {
      setError("Missing assignment ID.");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const result = (await downloadAssignmentReportAction(
        assignment.id,
      )) as DownloadReportResult;

      if (!result?.success) {
        setError(result?.message || "Failed to generate report.");
        return;
      }

      if (!result.file) {
        setError("Report was generated but no file was returned.");
        return;
      }

      downloadBase64Pdf({
        base64: result.file,
        fileName: `WasteX-Audit-${assignment.id}.pdf`,
      });

      setMessage("Audit report downloaded.");
    } catch (caughtError) {
      console.error("Download assignment report error:", caughtError);

      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to generate report.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5 rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
      {/* HEADER */}
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-black p-2 text-white">
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
        <div className="flex gap-2 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          <FiCheckCircle className="mt-0.5 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <FiAlertTriangle className="mt-0.5 shrink-0" />
          <span>{error}</span>
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
            <span className="font-medium text-red-500">Yes</span>
          ) : (
            <span className="font-medium text-green-600">No</span>
          )}
        </Row>
      </div>

      {/* DOWNLOAD */}
      <button
        type="button"
        onClick={handleDownload}
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-black py-3 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <FiDownload />
        {loading ? "Generating report..." : "Download Audit Report"}
      </button>
    </div>
  );
}

/* =========================================================
   SMALL COMPONENTS
========================================================= */

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex justify-between gap-4 border-b border-black/5 pb-2">
      <span className="text-black/50">{label}</span>
      <span className="text-right font-medium text-black">{children}</span>
    </div>
  );
}

/* =========================================================
   HELPERS
========================================================= */

function formatDate(date: Date | string | null | undefined) {
  if (!date) return "Not yet";

  const parsed = new Date(date);

  if (!Number.isFinite(parsed.getTime())) {
    return "Not yet";
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function downloadBase64Pdf({
  base64,
  fileName,
}: {
  base64: string;
  fileName: string;
}) {
  const byteCharacters = window.atob(base64);
  const byteNumbers = new Array<number>(byteCharacters.length);

  for (let index = 0; index < byteCharacters.length; index += 1) {
    byteNumbers[index] = byteCharacters.charCodeAt(index);
  }

  const byteArray = new Uint8Array(byteNumbers);

  const blob = new Blob([byteArray], {
    type: "application/pdf",
  });

  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();

  URL.revokeObjectURL(url);
}