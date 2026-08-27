import { auth } from "@/auth";
import { getWeighbridgeTicketData } from "@/modules/operations/weighbridge/getWeighbridgeTicketData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

function field(label: string, value: string) {
  return `
    <div class="field">
      <div class="label">${escapeHtml(label)}</div>
      <div class="value">${escapeHtml(value || "NOT RECORDED")}</div>
    </div>
  `;
}

export async function GET(
  request: Request,
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

  const url = new URL(request.url);
  const autoPrint = url.searchParams.get("auto") === "1";

  const sourceLabel =
    ticket.weightSource === "weighbridge"
      ? "Direct weighbridge capture"
      : ticket.weightSource === "imported"
        ? "Imported weight"
        : "Manual weight entry";

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(ticket.ticketNumber)} · Waste X</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #f4f1eb;
      color: #111;
      font-family: Arial, Helvetica, sans-serif;
    }
    .toolbar {
      position: sticky;
      top: 0;
      z-index: 5;
      display: flex;
      justify-content: center;
      gap: 10px;
      padding: 14px;
      background: #111;
    }
    .toolbar button, .toolbar a {
      border: 0;
      border-radius: 10px;
      padding: 11px 16px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      text-decoration: none;
    }
    .print { background: #ff7a14; color: #111; }
    .download { background: #fff; color: #111; }
    .sheet {
      width: min(900px, calc(100% - 32px));
      margin: 24px auto 48px;
      background: #fff;
      border: 1px solid #ddd8cf;
      border-radius: 18px;
      overflow: hidden;
      box-shadow: 0 16px 50px rgba(0,0,0,.08);
    }
    .header {
      background: #111;
      color: #fff;
      padding: 28px 30px;
    }
    .brand {
      color: #ff7a14;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: .22em;
      text-transform: uppercase;
    }
    h1 {
      margin: 9px 0 0;
      font-size: 27px;
    }
    .ticket-no {
      margin-top: 8px;
      color: rgba(255,255,255,.62);
      font-size: 13px;
    }
    .body { padding: 26px 30px 30px; }
    .weight-box {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 22px;
    }
    .weight {
      border: 1px solid #e5e0d8;
      border-radius: 14px;
      padding: 16px;
      background: #fbfaf7;
    }
    .weight.net {
      background: #fff3e7;
      border-color: #ffd2ad;
    }
    .weight .label {
      font-size: 10px;
      letter-spacing: .16em;
      text-transform: uppercase;
      color: #777;
      font-weight: 700;
    }
    .weight .number {
      margin-top: 6px;
      font-size: 22px;
      font-weight: 800;
    }
    .section-title {
      margin: 24px 0 10px;
      font-size: 10px;
      letter-spacing: .18em;
      text-transform: uppercase;
      color: #e76000;
      font-weight: 800;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      border-top: 1px solid #ece8e1;
      border-left: 1px solid #ece8e1;
    }
    .field {
      min-height: 70px;
      padding: 12px 14px;
      border-right: 1px solid #ece8e1;
      border-bottom: 1px solid #ece8e1;
    }
    .field .label {
      font-size: 9px;
      letter-spacing: .13em;
      text-transform: uppercase;
      color: #888;
      font-weight: 700;
    }
    .field .value {
      margin-top: 6px;
      font-size: 13px;
      font-weight: 700;
      line-height: 1.4;
    }
    .notice {
      margin-top: 22px;
      border-radius: 12px;
      background: #f7f4ee;
      padding: 13px 15px;
      font-size: 11px;
      line-height: 1.55;
      color: #666;
    }
    .footer {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      border-top: 1px solid #ece8e1;
      margin-top: 24px;
      padding-top: 16px;
      font-size: 10px;
      color: #888;
    }
    @media (max-width: 650px) {
      .weight-box, .grid { grid-template-columns: 1fr; }
    }
    @media print {
      @page { size: A4; margin: 12mm; }
      body { background: #fff; }
      .toolbar { display: none !important; }
      .sheet {
        width: 100%;
        margin: 0;
        border: 0;
        border-radius: 0;
        box-shadow: none;
      }
      .header {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .weight.net {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button class="print" onclick="window.print()">Print physical ticket</button>
    <a class="download" href="/api/operations/weighbridge-tickets/${encodeURIComponent(
      params.loadId,
    )}/pdf">Download PDF</a>
  </div>

  <article class="sheet">
    <header class="header">
      <div class="brand">Waste X</div>
      <h1>Weighbridge / Load Ticket</h1>
      <div class="ticket-no">${escapeHtml(ticket.ticketNumber)}</div>
    </header>

    <div class="body">
      <div class="weight-box">
        <div class="weight">
          <div class="label">Gross</div>
          <div class="number">${escapeHtml(
            formatWeight(ticket.grossWeight, ticket.weightMetric),
          )}</div>
        </div>
        <div class="weight">
          <div class="label">Tare</div>
          <div class="number">${escapeHtml(
            formatWeight(ticket.tareWeight, ticket.weightMetric),
          )}</div>
        </div>
        <div class="weight net">
          <div class="label">Net load</div>
          <div class="number">${escapeHtml(
            formatWeight(ticket.netWeight, ticket.weightMetric),
          )}</div>
        </div>
      </div>

      <div class="section-title">Weighing record</div>
      <div class="grid">
        ${field("Ticket number", ticket.ticketNumber)}
        ${field("Job / load", `${ticket.jobNumber} · Load ${ticket.loadNumber}`)}
        ${field("Arrival / first record", formatDateTime(ticket.arrivedAt))}
        ${field("Completed", formatDateTime(ticket.completedAt))}
        ${field("Weight source", sourceLabel)}
        ${field("Estimated weight", ticket.weightIsEstimate ? "YES" : "NO")}
      </div>

      <div class="section-title">Vehicle and carrier</div>
      <div class="grid">
        ${field("Vehicle registration", ticket.vehicleRegistration)}
        ${field("Driver", ticket.driverName)}
        ${field("Carrier", ticket.carrierName)}
        ${field("Carrier registration", ticket.carrierRegistrationNumber)}
      </div>

      <div class="section-title">Waste movement</div>
      <div class="grid">
        ${field("Customer / requesting party", ticket.customerName)}
        ${field("Customer / origin address", ticket.customerAddress)}
        ${field("Site / destination", ticket.siteName)}
        ${field("Site address", ticket.siteAddress)}
        ${field("EWC code", ticket.ewcCode)}
        ${field("Waste description", ticket.wasteDescription)}
        ${field("Permit / authorisation", ticket.permitNumber)}
        ${field("Direction", ticket.direction.toUpperCase())}
      </div>

      <div class="section-title">References</div>
      <div class="grid">
        ${field("Purchase order", ticket.purchaseOrder || "NOT RECORDED")}
        ${field(
          "Customer reference",
          ticket.customerReference || "NOT RECORDED",
        )}
      </div>

      <div class="notice">
        This Waste X ticket is generated from the completed operational load record.
        The weight source is shown above. Where a site operates public weighing equipment,
        its operator remains responsible for complying with the applicable weights and
        measures requirements and for recording only weights actually determined by that
        weighing equipment.
      </div>

      <div class="footer">
        <span>${escapeHtml(ticket.organisationName)}</span>
        <span>Generated by Waste X</span>
      </div>
    </div>
  </article>

  ${
    autoPrint
      ? `<script>window.addEventListener("load", () => setTimeout(() => window.print(), 250));</script>`
      : ""
  }
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}