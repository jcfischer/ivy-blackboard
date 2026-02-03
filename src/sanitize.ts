import { loadConfig } from "./config";

export interface ContentFilterConfig {
  maxFieldLength: number;
  stripCodeBlocks: boolean;
  stripHtmlTags: boolean;
}

/**
 * Sanitize text for safe storage. Defense-in-depth against prompt injection.
 * Strips code blocks, HTML tags, template literals. Truncates and trims.
 */
export function sanitizeText(
  text: string | null | undefined,
  config?: ContentFilterConfig
): string {
  if (text == null) return "";

  const cfg = config ?? loadConfig().contentFilter;
  let result = text;

  // Strip fenced code blocks (keep inner content)
  if (cfg.stripCodeBlocks) {
    result = result.replace(/```[\w]*\s?([\s\S]*?)```/g, "$1");
  }

  // Strip HTML tags (keep inner text)
  if (cfg.stripHtmlTags) {
    result = result.replace(/<[^>]+>/g, "");
  }

  // Always strip template literal expressions
  result = result.replace(/\$\{[^}]*\}/g, "");

  // Truncate to maxFieldLength
  if (result.length > cfg.maxFieldLength) {
    result = result.slice(0, cfg.maxFieldLength) + "...";
  }

  // Trim whitespace
  result = result.trim();

  return result;
}
