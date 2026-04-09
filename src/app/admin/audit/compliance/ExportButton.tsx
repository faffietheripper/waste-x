"use client";

import { generateComplianceReport } from "./actions";

export function ExportButton() {
  async function handleExport() {
    const base64 = await generateComplianceReport();

    const link = document.createElement("a");
    link.href = `data:application/pdf;base64,${base64}`;
    link.download = "wastex-compliance-report.pdf";
    link.click();
  }

  return (
    <button
      onClick={handleExport}
      className="bg-black text-white text-sm px-4 py-2 rounded"
    >
      Export PDF
    </button>
  );
}
