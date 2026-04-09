"use client";

import { generateOrganisationReport } from "./actions";

export function ExportOrgButton({ orgId }: { orgId: string }) {
  async function handleExport() {
    const base64 = await generateOrganisationReport(orgId);

    const link = document.createElement("a");
    link.href = `data:application/pdf;base64,${base64}`;
    link.download = "organisation-report.pdf";
    link.click();
  }

  return (
    <button
      onClick={handleExport}
      className="bg-black text-white text-sm px-4 py-2 rounded"
    >
      Export Report
    </button>
  );
}
