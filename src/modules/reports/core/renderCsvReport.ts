import type { ReportDataset } from "./getReportData";

export function renderCsvReport(dataset: ReportDataset) {
  const header = dataset.columns.map(escapeCsvValue).join(",");

  const body = dataset.rows
    .map((row) =>
      dataset.columns.map((column) => escapeCsvValue(row[column])).join(","),
    )
    .join("\n");

  return [header, body].filter(Boolean).join("\n");
}

function escapeCsvValue(value: unknown) {
  if (value === null || value === undefined) return "";

  let text =
    value instanceof Date
      ? value.toISOString()
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);

  text = text.replace(/\r?\n/g, " ").trim();

  if (text.includes('"')) {
    text = text.replace(/"/g, '""');
  }

  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text}"`;
  }

  return text;
}