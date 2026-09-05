import * as Crypto from "expo-crypto";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import { getLocalTicketById, type LocalWasteTicket } from "@/tickets/local-ticket";
import { openMobileDatabase } from "@/storage/database";

export const MOBILE_TICKET_PDF_TEMPLATE_VERSION = 1;

export type LocalTicketPdf = {
  ticketId: string;
  templateVersion: number;
  mimeType: "application/pdf";
  pdfBytes: Uint8Array;
  sha256: string;
  byteLength: number;
  generatedAt: string;
  createdAt: string;
  updatedAt: string;
};

type TicketPdfRow = {
  ticket_id: string;
  template_version: number;
  mime_type: "application/pdf";
  pdf_bytes: Uint8Array;
  sha256: string;
  byte_length: number;
  generated_at: string;
  created_at: string;
  updated_at: string;
};

function rowToTicketPdf(row: TicketPdfRow): LocalTicketPdf {
  return {
    ticketId: row.ticket_id,
    templateVersion: Number(row.template_version),
    mimeType: row.mime_type,
    pdfBytes: row.pdf_bytes,
    sha256: row.sha256,
    byteLength: Number(row.byte_length),
    generatedAt: row.generated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getLocalTicketPdf(ticketId: string) {
  const database = await openMobileDatabase();
  const row = await database.getFirstAsync<TicketPdfRow>(
    `SELECT
       ticket_id,
       template_version,
       mime_type,
       pdf_bytes,
       sha256,
       byte_length,
       generated_at,
       created_at,
       updated_at
     FROM local_ticket_document
     WHERE ticket_id = ?
     LIMIT 1`,
    ticketId,
  );
  return row ? rowToTicketPdf(row) : null;
}

function safePdfText(value: unknown) {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/\s+/g, " ")
    .trim();
}

function displayLocation(location: LocalWasteTicket["assignmentSnapshot"]["origin"]) {
  if (!location) return "Not recorded";
  return [location.name, location.fullAddress, location.postcode]
    .map(safePdfText)
    .filter(Boolean)
    .join(" | ");
}

function displayWeight(ticket: LocalWasteTicket) {
  const load = ticket.assignmentSnapshot.load;
  if (!load.netWeight) return "Not confirmed";
  return `${safePdfText(load.netWeight)} ${safePdfText(load.weightMetric)}`;
}

function wrapText(font: PDFFont, value: string, size: number, maxWidth: number) {
  const words = safePdfText(value).split(" ").filter(Boolean);
  if (words.length === 0) return ["-"];
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = word;
  }
  if (line) lines.push(line);
  return lines;
}

function drawField(input: {
  page: PDFPage;
  labelFont: PDFFont;
  valueFont: PDFFont;
  label: string;
  value: string;
  y: number;
  x?: number;
  width?: number;
}) {
  const x = input.x ?? 48;
  const width = input.width ?? 499;
  input.page.drawText(safePdfText(input.label).toUpperCase(), {
    x,
    y: input.y,
    size: 8,
    font: input.labelFont,
    color: rgb(0.4, 0.45, 0.52),
  });

  const lines = wrapText(input.valueFont, input.value, 10.5, width);
  let y = input.y - 15;
  for (const line of lines.slice(0, 4)) {
    input.page.drawText(line, {
      x,
      y,
      size: 10.5,
      font: input.valueFont,
      color: rgb(0.08, 0.1, 0.14),
    });
    y -= 14;
  }
  return y - 9;
}

async function sha256Hex(bytes: Uint8Array) {
  // Expo Crypto requires an ArrayBuffer-backed BufferSource. pdf-lib's save()
  // is typed as Uint8Array<ArrayBufferLike> in TS 6, so copy the exact PDF
  // bytes into a fresh ArrayBuffer-backed view before hashing.
  const stableBytes = new Uint8Array(bytes.byteLength);
  stableBytes.set(bytes);
  const digest = await Crypto.digest(
    Crypto.CryptoDigestAlgorithm.SHA256,
    stableBytes.buffer,
  );
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

async function renderTicketPdf(ticket: LocalWasteTicket) {
  const snapshot = ticket.assignmentSnapshot;
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Waste X Ticket ${ticket.ticketNumber}`);
  pdf.setSubject(`Waste movement ticket for ${snapshot.job.jobNumber}, load ${snapshot.load.loadNumber}`);
  pdf.setAuthor("Waste X");
  pdf.setCreator("Waste X Mobile");
  pdf.setProducer("Waste X Mobile offline ticket engine");
  pdf.setCreationDate(new Date(ticket.issuedAt));
  pdf.setModificationDate(new Date(ticket.issuedAt));

  const page = pdf.addPage([595.28, 841.89]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  page.drawText("Waste X", {
    x: 48,
    y: 790,
    size: 23,
    font: bold,
    color: rgb(0.06, 0.09, 0.14),
  });
  page.drawText("DIGITAL WASTE TICKET", {
    x: 48,
    y: 766,
    size: 9,
    font: bold,
    color: rgb(0.92, 0.31, 0.06),
  });
  page.drawText("Generated completely offline from the authorised local load snapshot", {
    x: 48,
    y: 748,
    size: 8.5,
    font: regular,
    color: rgb(0.4, 0.45, 0.52),
  });

  page.drawRectangle({
    x: 48,
    y: 680,
    width: 499,
    height: 52,
    color: rgb(0.06, 0.09, 0.14),
  });
  page.drawText(safePdfText(ticket.ticketNumber), {
    x: 61,
    y: 709,
    size: 13.5,
    font: bold,
    color: rgb(1, 1, 1),
  });
  page.drawText(
    `${safePdfText(snapshot.job.jobNumber)} | Load ${snapshot.load.loadNumber} | ${safePdfText(snapshot.job.direction)}`,
    {
      x: 61,
      y: 691,
      size: 8.5,
      font: regular,
      color: rgb(0.78, 0.82, 0.88),
    },
  );

  let y = 654;
  y = drawField({ page, labelFont: bold, valueFont: regular, label: "Movement date", value: snapshot.job.jobDate, y });
  y = drawField({ page, labelFont: bold, valueFont: regular, label: "Origin / collection", value: displayLocation(snapshot.origin), y });
  y = drawField({ page, labelFont: bold, valueFont: regular, label: "Destination / delivery", value: displayLocation(snapshot.destination), y });
  y = drawField({ page, labelFont: bold, valueFont: regular, label: "Waste description", value: snapshot.load.wasteDescription ?? snapshot.material?.name ?? "Not recorded", y });

  const leftX = 48;
  const rightX = 310;
  const columnWidth = 237;
  const rowStart = y;
  drawField({ page, labelFont: bold, valueFont: regular, label: "EWC", value: snapshot.load.ewcCode ?? "Not recorded", y: rowStart, x: leftX, width: columnWidth });
  y = drawField({ page, labelFont: bold, valueFont: regular, label: "Net quantity", value: displayWeight(ticket), y: rowStart, x: rightX, width: columnWidth });

  const secondRow = y;
  drawField({ page, labelFont: bold, valueFont: regular, label: "Driver", value: snapshot.transport.driverName, y: secondRow, x: leftX, width: columnWidth });
  y = drawField({ page, labelFont: bold, valueFont: regular, label: "Vehicle", value: snapshot.transport.vehicleRegistration ?? "Not assigned", y: secondRow, x: rightX, width: columnWidth });

  if (snapshot.load.grossWeight || snapshot.load.tareWeight) {
    const thirdRow = y;
    drawField({ page, labelFont: bold, valueFont: regular, label: "Gross", value: snapshot.load.grossWeight ? `${snapshot.load.grossWeight} ${snapshot.load.weightMetric}` : "Not recorded", y: thirdRow, x: leftX, width: columnWidth });
    y = drawField({ page, labelFont: bold, valueFont: regular, label: "Tare", value: snapshot.load.tareWeight ? `${snapshot.load.tareWeight} ${snapshot.load.weightMetric}` : "Not recorded", y: thirdRow, x: rightX, width: columnWidth });
  }

  page.drawLine({
    start: { x: 48, y: Math.max(y - 4, 112) },
    end: { x: 547, y: Math.max(y - 4, 112) },
    thickness: 0.7,
    color: rgb(0.88, 0.9, 0.93),
  });

  page.drawText(`Ticket ID: ${safePdfText(ticket.ticketId)}`, {
    x: 48,
    y: 82,
    size: 7.5,
    font: regular,
    color: rgb(0.45, 0.5, 0.56),
  });
  page.drawText(`Issued: ${safePdfText(ticket.issuedAt)} | Template v${MOBILE_TICKET_PDF_TEMPLATE_VERSION}`, {
    x: 48,
    y: 68,
    size: 7.5,
    font: regular,
    color: rgb(0.45, 0.5, 0.56),
  });
  page.drawText("Waste X local-first record. Signatures and evidence attach to this ticket identity.", {
    x: 48,
    y: 50,
    size: 7.5,
    font: bold,
    color: rgb(0.92, 0.31, 0.06),
  });

  return pdf.save({ useObjectStreams: false });
}

export async function generateLocalTicketPdf(ticketId: string) {
  const existing = await getLocalTicketPdf(ticketId);
  if (existing) return { document: existing, created: false };

  const ticket = await getLocalTicketById(ticketId);
  if (!ticket) {
    throw new Error("Waste X cannot generate a PDF because the local ticket does not exist.");
  }

  const bytes = await renderTicketPdf(ticket);
  const sha256 = await sha256Hex(bytes);
  const now = new Date().toISOString();
  const database = await openMobileDatabase();

  await database.runAsync(
    `INSERT INTO local_ticket_document (
       ticket_id,
       template_version,
       mime_type,
       pdf_bytes,
       sha256,
       byte_length,
       generated_at,
       created_at,
       updated_at
     ) VALUES (?, ?, 'application/pdf', ?, ?, ?, ?, ?, ?)`,
    ticket.ticketId,
    MOBILE_TICKET_PDF_TEMPLATE_VERSION,
    bytes,
    sha256,
    bytes.byteLength,
    now,
    now,
    now,
  );

  return {
    document: (await getLocalTicketPdf(ticket.ticketId))!,
    created: true,
  };
}
