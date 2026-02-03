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
 * Format an ISO 8601 timestamp as a human-readable relative time string.
 */
export function formatRelativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffSeconds = Math.floor(diffMs / 1000);

  if (diffSeconds < 60) return "just now";

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
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
