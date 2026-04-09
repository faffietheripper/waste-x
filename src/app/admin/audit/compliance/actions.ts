"use server";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "fs";
import path from "path";

import { database } from "@/db/database";
import {
  wasteListings,
  incidents,
  carrierAssignments,
  organisations,
} from "@/db/schema";

export async function generateComplianceReport() {
  // 📊 DATA
  const listings = await database.select().from(wasteListings);
  const allIncidents = await database.select().from(incidents);
  const assignments = await database.select().from(carrierAssignments);
  const orgs = await database.select().from(organisations);

  const totalListings = listings.length;
  const completed = listings.filter((l) => l.status === "completed").length;
  const unresolved = allIncidents.filter((i) => i.status !== "resolved").length;

  const verificationUsed = assignments.filter(
    (a) => a.codeUsedAt !== null,
  ).length;

  const completionRate =
    totalListings > 0 ? Math.round((completed / totalListings) * 100) : 0;

  const verificationRate =
    assignments.length > 0
      ? Math.round((verificationUsed / assignments.length) * 100)
      : 0;

  // 🧠 TRUST SCORES
  const orgStats = orgs.map((org) => {
    const orgListings = listings.filter((l) => l.organisationId === org.id);
    const orgIncidents = allIncidents.filter(
      (i) => i.organisationId === org.id,
    );

    const completedCount = orgListings.filter(
      (l) => l.status === "completed",
    ).length;

    const completionRate =
      orgListings.length > 0 ? completedCount / orgListings.length : 0;

    const incidentRate =
      orgListings.length > 0 ? orgIncidents.length / orgListings.length : 0;

    const trustScore = Math.round(
      completionRate * 60 + (1 - incidentRate) * 40,
    );

    return {
      name: org.teamName,
      trustScore,
      incidents: orgIncidents.length,
    };
  });

  // 📄 PDF SETUP
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([600, 800]);

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = 750;

  // 🎨 COLORS
  const primary = rgb(0.95, 0.4, 0); // WasteX orange vibe
  const dark = rgb(0, 0, 0);

  // 🖼️ LOAD LOGO
  try {
    const logoPath = path.join(process.cwd(), "public/wastexblack.png");
    const logoBytes = fs.readFileSync(logoPath);
    const logoImage = await pdfDoc.embedPng(logoBytes);

    page.drawImage(logoImage, {
      x: 50,
      y: 720,
      width: 120,
      height: 40,
    });
  } catch (e) {
    console.log("Logo not found, skipping...");
  }

  // 🔶 HEADER BAR
  page.drawRectangle({
    x: 0,
    y: 680,
    width: 600,
    height: 40,
    color: primary,
  });

  page.drawText("COMPLIANCE REPORT", {
    x: 50,
    y: 695,
    size: 14,
    font: boldFont,
    color: rgb(1, 1, 1),
  });

  y = 650;

  function drawSectionTitle(text: string) {
    page.drawText(text, {
      x: 50,
      y,
      size: 14,
      font: boldFont,
      color: dark,
    });
    y -= 20;
  }

  function drawText(text: string, size = 11) {
    page.drawText(text, {
      x: 50,
      y,
      size,
      font,
      color: dark,
    });
    y -= size + 6;
  }

  // 📊 PLATFORM METRICS
  drawSectionTitle("Platform Metrics");
  drawText(`Chain Completion: ${completionRate}%`);
  drawText(`Verification Usage: ${verificationRate}%`);
  drawText(`Unresolved Incidents: ${unresolved}`);

  y -= 10;

  // 🧠 TRUST SCORES
  drawSectionTitle("Top Organisation Trust Scores");

  orgStats.slice(0, 10).forEach((org) => {
    drawText(
      `${org.name} — Trust: ${org.trustScore} | Incidents: ${org.incidents}`,
    );
  });

  y -= 20;

  // 📅 FOOTER
  page.drawText(`Generated: ${new Date().toLocaleString()}`, {
    x: 50,
    y: 40,
    size: 9,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });

  page.drawText("WasteX Digital Waste Tracking Platform", {
    x: 50,
    y: 25,
    size: 9,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });

  // 💾 SAVE
  const pdfBytes = await pdfDoc.save();

  return Buffer.from(pdfBytes).toString("base64");
}
