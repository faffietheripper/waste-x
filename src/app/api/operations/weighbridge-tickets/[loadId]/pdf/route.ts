import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { auth } from "@/auth";
import { getWeighbridgeTicketData } from "@/modules/operations/weighbridge/getWeighbridgeTicketData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pdfText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDateTime(value: Date | null) {
  if (!value) return "NOT RECORDED";

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function formatWeight(
  value: string | null,
  metric: "Grams" | "Kilograms" | "Tonnes",
) {
  if (!value) return "NOT RECORDED";

  const amount = Number(value);
  const display = Number.isFinite(amount) ? amount.toFixed(3) : value;
  const unit =
    metric === "Tonnes" ? "t" : metric === "Kilograms" ? "kg" : "g";

  return `${display} ${unit}`;
}

function wrapText(text: string, maxChars: number) {
  const words = pdfText(text).split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;

    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) lines.push(current);

  return lines.length ? lines : ["NOT RECORDED"];
}

export async function GET(
  _request: Request,
  { params }: { params: { loadId: string } },
) {
  const session = await auth();

  if (!session?.user?.id) {
    return new Response("Unauthorised", { status: 401 });
  }

  const ticket = await getWeighbridgeTicketData({
    userId: session.user.id,
    loadId: params.loadId,
  });

  if (!ticket) {
    return new Response("Ticket not found or load is not completed.", {
      status: 404,
    });
  }

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const width = page.getWidth();
  const margin = 42;
  const orange = rgb(1, 0.39, 0.05);
  const black = rgb(0.05, 0.05, 0.05);
  const muted = rgb(0.45, 0.45, 0.45);
  const light = rgb(0.93, 0.92, 0.89);

  page.drawRectangle({
    x: 0,
    y: 735,
    width,
    height: 106.89,
    color: black,
  });

  page.drawText("WASTE X", {
    x: margin,
    y: 807,
    size: 10,
    font: bold,
    color: orange,
  });

  page.drawText("WEIGHBRIDGE / LOAD TICKET", {
    x: margin,
    y: 775,
    size: 22,
    font: bold,
    color: rgb(1, 1, 1),
  });

  page.drawText(pdfText(ticket.ticketNumber), {
    x: margin,
    y: 753,
    size: 10,
    font: regular,
    color: rgb(0.72, 0.72, 0.72),
  });

  let y = 700;

  function sectionTitle(title: string) {
    page.drawText(pdfText(title).toUpperCase(), {
      x: margin,
      y,
      size: 8,
      font: bold,
      color: orange,
    });
    y -= 15;
  }

  function weightBox(
    x: number,
    label: string,
    value: string,
    highlighted = false,
  ) {
    page.drawRectangle({
      x,
      y: y - 48,
      width: 158,
      height: 55,
      color: highlighted ? rgb(1, 0.95, 0.9) : rgb(0.98, 0.97, 0.95),
      borderColor: highlighted ? rgb(1, 0.78, 0.58) : light,
      borderWidth: 1,
    });

    page.drawText(pdfText(label).toUpperCase(), {
      x: x + 10,
      y: y - 10,
      size: 7,
      font: bold,
      color: muted,
    });

    page.drawText(pdfText(value), {
      x: x + 10,
      y: y - 34,
      size: 16,
      font: bold,
      color: black,
    });
  }

  weightBox(
    margin,
    "Gross",
    formatWeight(ticket.grossWeight, ticket.weightMetric),
  );
  weightBox(
    margin + 169,
    "Tare",
    formatWeight(ticket.tareWeight, ticket.weightMetric),
  );
  weightBox(
    margin + 338,
    "Net load",
    formatWeight(ticket.netWeight, ticket.weightMetric),
    true,
  );

  y -= 78;

  function fieldRow(
    leftLabel: string,
    leftValue: string,
    rightLabel: string,
    rightValue: string,
  ) {
    const colWidth = 250;
    const lineHeight = 11;

    const leftLines = wrapText(leftValue || "NOT RECORDED", 38).slice(0, 3);
    const rightLines = wrapText(rightValue || "NOT RECORDED", 38).slice(0, 3);
    const rowHeight =
      Math.max(leftLines.length, rightLines.length) * lineHeight + 29;

    page.drawRectangle({
      x: margin,
      y: y - rowHeight + 8,
      width: colWidth,
      height: rowHeight,
      borderColor: light,
      borderWidth: 1,
    });
    page.drawRectangle({
      x: margin + colWidth,
      y: y - rowHeight + 8,
      width: colWidth,
      height: rowHeight,
      borderColor: light,
      borderWidth: 1,
    });

    page.drawText(pdfText(leftLabel).toUpperCase(), {
      x: margin + 9,
      y: y - 6,
      size: 6.5,
      font: bold,
      color: muted,
    });
    page.drawText(pdfText(rightLabel).toUpperCase(), {
      x: margin + colWidth + 9,
      y: y - 6,
      size: 6.5,
      font: bold,
      color: muted,
    });

    leftLines.forEach((line, index) => {
      page.drawText(line, {
        x: margin + 9,
        y: y - 22 - index * lineHeight,
        size: 9,
        font: bold,
        color: black,
      });
    });

    rightLines.forEach((line, index) => {
      page.drawText(line, {
        x: margin + colWidth + 9,
        y: y - 22 - index * lineHeight,
        size: 9,
        font: bold,
        color: black,
      });
    });

    y -= rowHeight;
  }

  sectionTitle("Weighing record");
  fieldRow(
    "Job / load",
    `${ticket.jobNumber} / Load ${ticket.loadNumber}`,
    "Completed",
    formatDateTime(ticket.completedAt),
  );
  fieldRow(
    "Arrival / first record",
    formatDateTime(ticket.arrivedAt),
    "Weight source",
    ticket.weightSource === "weighbridge"
      ? "Direct weighbridge capture"
      : ticket.weightSource === "imported"
        ? "Imported weight"
        : "Manual weight entry",
  );

  sectionTitle("Vehicle and carrier");
  fieldRow(
    "Vehicle registration",
    ticket.vehicleRegistration,
    "Driver",
    ticket.driverName,
  );
  fieldRow(
    "Carrier",
    ticket.carrierName,
    "Carrier registration",
    ticket.carrierRegistrationNumber,
  );

  sectionTitle("Waste movement");
  fieldRow(
    "Customer / requesting party",
    ticket.customerName,
    "EWC code",
    ticket.ewcCode,
  );
  fieldRow(
    "Customer / origin address",
    ticket.customerAddress,
    "Site / destination",
    ticket.siteName,
  );
  fieldRow(
    "Waste description",
    ticket.wasteDescription,
    "Permit / authorisation",
    ticket.permitNumber,
  );

  if (y > 120) {
    y -= 6;
    page.drawText(
      pdfText(
        `Weight type: ${ticket.weightIsEstimate ? "ESTIMATED" : "ACTUAL / NOT MARKED ESTIMATED"} | Direction: ${ticket.direction.toUpperCase()}`,
      ),
      {
        x: margin,
        y,
        size: 8,
        font: regular,
        color: muted,
      },
    );
  }

  page.drawLine({
    start: { x: margin, y: 55 },
    end: { x: width - margin, y: 55 },
    thickness: 1,
    color: light,
  });

  page.drawText(pdfText(ticket.organisationName), {
    x: margin,
    y: 38,
    size: 8,
    font: bold,
    color: muted,
  });

  page.drawText("Generated by Waste X", {
    x: width - margin - 95,
    y: 38,
    size: 8,
    font: regular,
    color: muted,
  });

  const bytes = await pdf.save();
  const fileName = `${ticket.ticketNumber.replace(/[^A-Za-z0-9._-]+/g, "-")}.pdf`;

  // pdf-lib returns Uint8Array. Converting the exact byte range to a plain
  // ArrayBuffer keeps the Route Handler response compatible with the DOM
  // BodyInit type used by this Next.js/TypeScript setup.
  const body = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;

  return new Response(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
