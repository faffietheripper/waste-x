"use server";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "fs";
import path from "path";

import { database } from "@/db/database";
import {
  organisations,
  wasteListings,
  incidents,
  carrierAssignments,
} from "@/db/schema";
import { eq } from "drizzle-orm";

export async function generateOrganisationReport(orgId: string) {
  // 📊 DATA
  const org = await database.query.organisations.findFirst({
    where: eq(organisations.id, orgId),
  });

  if (!org) throw new Error("Organisation not found");

  const listings = await database.select().from(wasteListings);
  const allIncidents = await database.select().from(incidents);
  const assignments = await database.select().from(carrierAssignments);

  const orgListings = listings.filter((l) => l.organisationId === orgId);
  const orgIncidents = allIncidents.filter((i) => i.organisationId === orgId);
  const orgAssignments = assignments.filter((a) => a.organisationId === orgId);

  const completed = orgListings.filter((l) => l.status === "completed").length;

  const completionRate =
    orgListings.length > 0 ? completed / orgListings.length : 0;

  const incidentRate =
    orgListings.length > 0 ? orgIncidents.length / orgListings.length : 0;

  const verificationRate =
    orgAssignments.length > 0
      ? orgAssignments.filter((a) => a.codeUsedAt !== null).length /
        orgAssignments.length
      : 0;

  const trustScore = Math.round(
    completionRate * 50 + (1 - incidentRate) * 30 + verificationRate * 20,
  );

  // =========================
  // 📄 PDF
  // =========================

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([600, 800]);

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = 750;

  const primary = rgb(0.95, 0.4, 0);

  // LOGO
  try {
    const logoPath = path.join(process.cwd(), "public/wastex-logo.png");
    const logoBytes = fs.readFileSync(logoPath);
    const logo = await pdfDoc.embedPng(logoBytes);

    page.drawImage(logo, {
      x: 50,
      y: 720,
      width: 120,
      height: 40,
    });
  } catch {}

  // HEADER BAR
  page.drawRectangle({
    x: 0,
    y: 680,
    width: 600,
    height: 40,
    color: primary,
  });

  page.drawText("ORGANISATION COMPLIANCE REPORT", {
    x: 50,
    y: 695,
    size: 14,
    font: bold,
    color: rgb(1, 1, 1),
  });

  y = 650;

  const draw = (text: string, size = 11, isBold = false) => {
    page.drawText(text, {
      x: 50,
      y,
      size,
      font: isBold ? bold : font,
    });
    y -= size + 6;
  };

  // ORG INFO
  draw(org.teamName, 16, true);
  draw(`Industry: ${org.industry || "—"}`);
  draw(`Email: ${org.emailAddress}`);
  draw(`Telephone: ${org.telephone}`);

  y -= 10;

  // METRICS
  draw("Performance Metrics", 14, true);
  draw(`Trust Score: ${trustScore}`);
  draw(`Completion Rate: ${Math.round(completionRate * 100)}%`);
  draw(`Incidents: ${orgIncidents.length}`);
  draw(`Verification Rate: ${Math.round(verificationRate * 100)}%`);

  y -= 10;

  // RISK
  draw("Risk Assessment", 14, true);

  if (trustScore < 40) draw("High Risk Organisation");
  if (orgIncidents.length > 3) draw("Multiple Incidents");
  if (completionRate < 0.5) draw("Low Completion Rate");

  if (trustScore >= 60) draw("✅ Healthy Organisation");

  y -= 20;

  // FOOTER
  draw(`Generated: ${new Date().toLocaleString()}`, 9);
  draw("WasteX Digital Waste Tracking Platform", 9);

  const bytes = await pdfDoc.save();

  return Buffer.from(bytes).toString("base64");
}
