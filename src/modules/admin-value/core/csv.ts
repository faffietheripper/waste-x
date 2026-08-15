function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";

  const isTextValue = typeof value === "string";
  let text = value instanceof Date ? value.toISOString() : String(value);

  // Prevent spreadsheet formula injection for user-entered text fields while
  // preserving genuine negative numeric values as numbers.
  if (isTextValue && /^[=+\-@]/.test(text)) {
    text = `'${text}`;
  }

  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

export function rowsToCsv(rows: unknown[][]) {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
