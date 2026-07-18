import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { getAssignmentById } from "../queries/getAssignmentById";

/* =========================================================
   PUBLIC API
========================================================= */

export async function generateAssignmentReport(assignmentId: string) {
  const assignment = await getAssignmentById(assignmentId);

  if (!assignment) {
    return {
      success: false,
      message: "Assignment not found.",
    };
  }

  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([600, 800]);

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = 760;

  const drawText = (text: string, size = 10, bold = false) => {
    const safeText = sanitisePdfText(text);

    const lines = wrapText(safeText, size);

    for (const line of lines) {
      if (y < 60) {
        page = pdfDoc.addPage([600, 800]);
        y = 760;
      }

      page.drawText(line, {
        x: 50,
        y,
        size,
        font: bold ? boldFont : font,
        color: rgb(0, 0, 0),
      });

      y -= size + 6;
    }
  };

  const drawSection = (title: string) => {
    if (y < 90) {
      page = pdfDoc.addPage([600, 800]);
      y = 760;
    }

    y -= 10;

    drawText(title.toUpperCase(), 12, true);

    y -= 4;

    page.drawLine({
      start: { x: 50, y },
      end: { x: 550, y },
      thickness: 1,
      color: rgb(0.9, 0.4, 0),
    });

    y -= 10;
  };

  const listing = getObjectField(assignment, "listing");
  const carrierOrg = getObjectField(assignment, "carrierOrg");
  const generatorOrg = getObjectField(assignment, "generatorOrg");
  const managerOrg = getObjectField(assignment, "managerOrg");
  const incident = getObjectField(assignment, "incident");

  /* ===============================
     HEADER
  =============================== */

  page.drawRectangle({
    x: 0,
    y: 740,
    width: 600,
    height: 60,
    color: rgb(0.05, 0.05, 0.05),
  });

  page.drawText("WASTE X", {
    x: 50,
    y: 765,
    size: 18,
    font: boldFont,
    color: rgb(1, 0.5, 0),
  });

  page.drawText("Compliance Audit Report", {
    x: 50,
    y: 748,
    size: 10,
    font,
    color: rgb(1, 1, 1),
  });

  y = 720;

  /* ===============================
     ASSIGNMENT INFO
  =============================== */

  drawSection("Assignment Overview");

  drawText(`Assignment ID: ${getDisplayValue(assignment, "id") || "Unknown"}`);
  drawText(`Status: ${formatLabel(getDisplayValue(assignment, "status"))}`);
  drawText(`Listing: ${getDisplayValue(listing, "name") || "Unknown"}`);
  drawText(`Location: ${getDisplayValue(listing, "location") || "Unknown"}`);
  drawText(`Listing Status: ${formatLabel(getDisplayValue(listing, "status"))}`);

  /* ===============================
     ORGANISATIONS
  =============================== */

  drawSection("Chain of Custody");

  drawText(`Generator: ${getOrganisationName(generatorOrg)}`);
  drawText(`Carrier: ${getOrganisationName(carrierOrg)}`);
  drawText(`Manager / Receiver: ${getOrganisationName(managerOrg)}`);

  /* ===============================
     TIMELINE
  =============================== */

  drawSection("Lifecycle Timeline");

  drawText(`Assigned: ${formatDate(getField(assignment, "assignedAt"))}`);
  drawText(`Responded: ${formatDate(getField(assignment, "respondedAt"))}`);
  drawText(`Collected: ${formatDate(getField(assignment, "collectedAt"))}`);
  drawText(`Completed: ${formatDate(getField(assignment, "completedAt"))}`);

  /* ===============================
     VERIFICATION
  =============================== */

  drawSection("Verification");

  drawText(
    `Verification Code: ${
      getDisplayValue(assignment, "verificationCode") || "Not generated"
    }`,
  );

  drawText(`Code Generated At: ${formatDate(getField(assignment, "codeGeneratedAt"))}`);
  drawText(`Code Used At: ${formatDate(getField(assignment, "codeUsedAt"))}`);

  /* ===============================
     INCIDENT
  =============================== */

  drawSection("Incident Report");

  if (incident) {
    drawText(`Status: ${formatLabel(getDisplayValue(incident, "status"))}`);

    const incidentType = getDisplayValue(incident, "type");
    if (incidentType) {
      drawText(`Type: ${formatLabel(incidentType)}`);
    }

    const summary = getDisplayValue(incident, "summary");
    if (summary) {
      drawText(`Summary: ${summary}`);
    }

    const immediateAction = getDisplayValue(incident, "immediateAction");
    if (immediateAction) {
      drawText(`Immediate Action: ${immediateAction}`);
    }

    const investigationFindings =
      getDisplayValue(incident, "investigationFindings") ||
      getDisplayValue(incident, "findings");

    if (investigationFindings) {
      drawText(`Investigation Findings: ${investigationFindings}`);
    }

    const correctiveActions = getDisplayValue(incident, "correctiveActions");
    if (correctiveActions) {
      drawText(`Corrective Actions: ${correctiveActions}`);
    }

    const preventativeMeasures =
      getDisplayValue(incident, "preventativeMeasures") ||
      getDisplayValue(incident, "preventiveMeasures");

    if (preventativeMeasures) {
      drawText(`Preventative Measures: ${preventativeMeasures}`);
    }

    const complianceReview = getDisplayValue(incident, "complianceReview");
    if (complianceReview) {
      drawText(`Compliance Review: ${complianceReview}`);
    }

    const responsiblePerson = getDisplayValue(incident, "responsiblePerson");
    if (responsiblePerson) {
      drawText(`Responsible Person: ${responsiblePerson}`);
    }

    drawText(`Incident Date: ${formatDate(getField(incident, "incidentDate"))}`);
    drawText(`Closed At: ${formatDate(getField(incident, "dateClosed"))}`);
    drawText(`Resolved At: ${formatDate(getField(incident, "resolvedAt"))}`);
  } else {
    drawText("No incident recorded.");
  }

  /* ===============================
     SIGNATURES
  =============================== */

  drawSection("Sign-off");

  drawText("Generator Signature: ________________________");
  drawText("Carrier Signature: ________________________");
  drawText("Manager / Receiver Signature: ________________________");
  drawText("Compliance Officer: ________________________");

  drawText(`Report Generated: ${formatDate(new Date())}`);

  /* ===============================
     OUTPUT
  =============================== */

  const pdfBytes = await pdfDoc.save();

  return {
    success: true,
    file: Buffer.from(pdfBytes).toString("base64"),
  };
}

/* =========================================================
   HELPERS
========================================================= */

function getField(row: unknown, key: string): unknown {
  if (!row || typeof row !== "object") return null;

  return (row as Record<string, unknown>)[key] ?? null;
}

function getObjectField(row: unknown, key: string): Record<string, unknown> | null {
  const value = getField(row, key);

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function getDisplayValue(row: unknown, key: string) {
  const value = getField(row, key);

  if (value === null || value === undefined) return "";

  if (value instanceof Date) {
    return formatDate(value);
  }

  return String(value);
}

function getOrganisationName(org: Record<string, unknown> | null) {
  if (!org) return "Unknown";

  return (
    getDisplayValue(org, "teamName") ||
    getDisplayValue(org, "name") ||
    getDisplayValue(org, "emailAddress") ||
    "Unknown"
  );
}

function formatDate(value: unknown) {
  if (!value) return "Not recorded";

  const date = new Date(value as string | number | Date);

  if (!Number.isFinite(date.getTime())) {
    return "Not recorded";
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatLabel(value: string | null | undefined) {
  if (!value) return "Unknown";

  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sanitisePdfText(value: string) {
  return value
    .replace(/\r?\n|\r/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wrapText(text: string, size: number) {
  const maxChars = size >= 12 ? 68 : 85;

  if (text.length <= maxChars) {
    return [text];
  }

  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;

    if (nextLine.length > maxChars) {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        lines.push(word);
        currentLine = "";
      }
    } else {
      currentLine = nextLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}