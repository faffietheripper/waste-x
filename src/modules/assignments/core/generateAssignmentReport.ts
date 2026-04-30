import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getAssignmentById } from "../queries/getAssignmentById";

function formatDate(date: any) {
  if (!date) return "Not recorded";
  return new Date(date).toLocaleString();
}

export async function generateAssignmentReport(assignmentId: string) {
  const assignment = await getAssignmentById(assignmentId);

  if (!assignment) {
    return {
      success: false,
      message: "Assignment not found",
    };
  }

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([600, 800]);

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = 760;

  const drawText = (text: string, size = 10, bold = false) => {
    page.drawText(text, {
      x: 50,
      y,
      size,
      font: bold ? boldFont : font,
      color: rgb(0, 0, 0),
    });
    y -= size + 6;
  };

  const drawSection = (title: string) => {
    y -= 10;
    drawText(title.toUpperCase(), 12, true);
    y -= 4;

    page.drawLine({
      start: { x: 50, y },
      end: { x: 550, y },
      thickness: 1,
      color: rgb(0.9, 0.4, 0), // orange accent
    });

    y -= 10;
  };

  /* ===============================
     HEADER (BRANDING)
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

  drawText(`Assignment ID: ${assignment.id}`);
  drawText(`Status: ${assignment.status}`);
  drawText(`Listing: ${assignment.listing?.name ?? "Unknown"}`);
  drawText(`Location: ${assignment.listing?.location ?? "Unknown"}`);

  /* ===============================
     ORGANISATIONS
  =============================== */

  drawSection("Chain of Custody");

  drawText(`Generator: ${assignment.generatorOrg?.name ?? "Unknown"}`);
  drawText(`Carrier: ${assignment.carrierOrg?.name ?? "Unknown"}`);

  /* ===============================
     TIMELINE
  =============================== */

  drawSection("Lifecycle Timeline");

  drawText(`Assigned: ${formatDate(assignment.assignedAt)}`);
  drawText(`Accepted: ${formatDate(assignment.respondedAt)}`);
  drawText(`Collected: ${formatDate(assignment.collectedAt)}`);
  drawText(`Completed: ${formatDate(assignment.completedAt)}`);

  /* ===============================
     VERIFICATION
  =============================== */

  drawSection("Verification");

  drawText(
    `Verification Code: ${assignment.verificationCode ?? "Not generated"}`,
  );

  /* ===============================
     INCIDENT
  =============================== */

  drawSection("Incident Report");

  if (assignment.incident) {
    drawText(`Status: ${assignment.incident.status}`);

    if (assignment.incident.findings) {
      drawText(`Findings: ${assignment.incident.findings}`);
    }

    if (assignment.incident.correctiveActions) {
      drawText(`Corrective Actions: ${assignment.incident.correctiveActions}`);
    }

    if (assignment.incident.preventativeMeasures) {
      drawText(
        `Preventative Measures: ${assignment.incident.preventativeMeasures}`,
      );
    }

    if (assignment.incident.dateClosed) {
      drawText(`Closed At: ${formatDate(assignment.incident.dateClosed)}`);
    }
  } else {
    drawText("No incident recorded.");
  }

  /* ===============================
     SIGNATURES
  =============================== */

  drawSection("Sign-off");

  drawText("Generator Signature: ________________________");
  drawText("Carrier Signature: ________________________");
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
