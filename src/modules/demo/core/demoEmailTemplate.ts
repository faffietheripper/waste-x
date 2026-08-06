export type DemoRequestEmailData = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  companyName: string;
  companyType: string;
  organisationSize: string;
  message: string;
  submittedAt: string;
};

export function buildDemoRequestEmail(data: DemoRequestEmailData) {
  const fullName = `${data.firstName} ${data.lastName}`.trim();
  const subject = `New Waste X demo request — ${data.companyName}`;

  const html = `
    <!doctype html>
    <html>
      <body style="margin:0;background:#f7f3ed;font-family:Arial,sans-serif;color:#111111;">
        <div style="max-width:720px;margin:0 auto;padding:32px 20px;">
          <div style="background:#000000;border-radius:28px;padding:28px;color:#ffffff;">
            <p style="margin:0 0 12px 0;color:#f97316;font-size:12px;font-weight:800;letter-spacing:0.22em;text-transform:uppercase;">
              Waste X Demo Request
            </p>

            <h1 style="margin:0;font-size:32px;line-height:1.1;">
              New demo request received
            </h1>

            <p style="margin:16px 0 0 0;color:rgba(255,255,255,0.7);font-size:15px;line-height:1.6;">
              A new organisation has requested a Waste X demo.
            </p>
          </div>

          <div style="margin-top:18px;background:#ffffff;border:1px solid rgba(0,0,0,0.08);border-radius:24px;overflow:hidden;">
            ${emailRow("Name", fullName)}
            ${emailRow("Email", data.email)}
            ${emailRow("Phone", data.phone || "Not provided")}
            ${emailRow("Company", data.companyName)}
            ${emailRow("Company type", formatCompanyType(data.companyType))}
            ${emailRow("Organisation size", data.organisationSize || "Not provided")}
            ${emailRow("Submitted at", formatDate(data.submittedAt))}
          </div>

          <div style="margin-top:18px;background:#ffffff;border:1px solid rgba(0,0,0,0.08);border-radius:24px;padding:24px;">
            <p style="margin:0 0 10px 0;color:#f97316;font-size:12px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;">
              Message
            </p>

            <p style="margin:0;color:#111111;font-size:15px;line-height:1.7;white-space:pre-wrap;">
              ${escapeHtml(data.message || "No message provided.")}
            </p>
          </div>

          <div style="margin-top:18px;background:#fff7ed;border:1px solid #fed7aa;border-radius:24px;padding:20px;">
            <p style="margin:0;color:#9a3412;font-size:14px;line-height:1.6;">
              Reply directly to this email to respond to ${escapeHtml(fullName)}.
            </p>
          </div>

          <p style="margin:24px 0 0 0;text-align:center;color:rgba(0,0,0,0.45);font-size:12px;">
            Waste X · Demo request notification
          </p>
        </div>
      </body>
    </html>
  `;

  const text = [
    "New Waste X demo request",
    "",
    `Name: ${fullName}`,
    `Email: ${data.email}`,
    `Phone: ${data.phone || "Not provided"}`,
    `Company: ${data.companyName}`,
    `Company type: ${formatCompanyType(data.companyType)}`,
    `Organisation size: ${data.organisationSize || "Not provided"}`,
    `Submitted at: ${formatDate(data.submittedAt)}`,
    "",
    "Message:",
    data.message || "No message provided.",
  ].join("\n");

  return {
    subject,
    html,
    text,
  };
}

function emailRow(label: string, value: string) {
  return `
    <div style="display:block;padding:18px 22px;border-bottom:1px solid rgba(0,0,0,0.06);">
      <p style="margin:0 0 6px 0;color:rgba(0,0,0,0.45);font-size:11px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;">
        ${escapeHtml(label)}
      </p>

      <p style="margin:0;color:#111111;font-size:15px;font-weight:700;line-height:1.5;">
        ${escapeHtml(value)}
      </p>
    </div>
  `;
}

function formatCompanyType(value: string) {
  switch (value) {
    case "construction_demolition":
      return "Construction / demolition";
    case "waste_generator":
      return "Waste generator";
    case "waste_carrier":
      return "Waste carrier";
    case "waste_manager":
      return "Waste manager";
    case "skip_hire":
      return "Skip hire";
    case "transfer_station":
      return "Transfer station";
    case "broker_consultant":
      return "Broker / consultant";
    case "other":
      return "Other";
    default:
      return "Not provided";
  }
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(date);
}

function escapeHtml(value: string) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}