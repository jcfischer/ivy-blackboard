/**
 * Format data as JSON envelope string.
 * Arrays get { ok, count, items, timestamp }.
 * Objects get { ok, ...data, timestamp }.
 * Errors get { ok: false, error, timestamp }.
 */
export function formatJson<T>(data: T | T[], ok: boolean = true): string {
  const timestamp = new Date().toISOString();

  if (Array.isArray(data)) {
    return JSON.stringify(
      { ok, count: data.length, items: data, timestamp },
      null,
      2
    );
  }

  return JSON.stringify({ ok, ...data, timestamp }, null, 2);
}

/**
 * Format data as an aligned ASCII table.
 */
export function formatTable(headers: string[], rows: string[][]): string {
  // Calculate column widths
  const widths = headers.map((h, i) => {
    const dataMax = rows.reduce(
      (max, row) => Math.max(max, (row[i] ?? "").length),
      0
    );
    return Math.max(h.length, dataMax);
  });

  // Format header
  const headerLine = headers
    .map((h, i) => h.padEnd(widths[i]))
    .join("  ");

  const separator = widths.map((w) => "─".repeat(w)).join("──");

  // Format rows
  const dataLines = rows.map((row) =>
    row.map((cell, i) => (cell ?? "").padEnd(widths[i])).join("  ")
  );

  return [headerLine, separator, ...dataLines].join("\n");
}

/**
 * Print output in the appropriate format based on --json flag.
 */
export function printOutput<T>(
  data: T | T[],
  jsonMode: boolean,
  headers?: string[],
  rowMapper?: (item: T) => string[]
): void {
  if (jsonMode) {
    console.log(formatJson(data));
  } else if (headers && rowMapper && Array.isArray(data)) {
    console.log(formatTable(headers, data.map(rowMapper)));
  } else {
    console.log(data);
  }
}
