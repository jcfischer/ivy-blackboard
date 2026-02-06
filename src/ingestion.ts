import { filterContentString } from "pai-content-filter";
import type { FilterResult, FileFormat } from "pai-content-filter";
import { BlackboardError } from "./errors";

/**
 * Sources considered external (untrusted) that require content filtering.
 * Local and operator sources are trusted and bypass the filter.
 */
const TRUSTED_SOURCES = new Set(["local", "operator"]);

export interface IngestResult {
  allowed: boolean;
  metadata?: {
    human_review_required: boolean;
    filter_decision: string;
    filter_matches?: Array<{ pattern_id: string; category: string; severity: string }>;
  };
}

/**
 * Check if a source requires content filtering.
 * Local and operator sources are trusted; everything else is external.
 */
export function requiresFiltering(source: string): boolean {
  return !TRUSTED_SOURCES.has(source);
}

/**
 * Run pai-content-filter on external content at the ingestion boundary.
 *
 * Decision mapping:
 * - BLOCKED  → throws BlackboardError('CONTENT_BLOCKED')
 * - HUMAN_REVIEW → returns { allowed: true, metadata: { human_review_required: true } }
 * - ALLOWED  → returns { allowed: true }
 *
 * Trusted sources (local, operator) bypass the filter entirely.
 */
export function ingestExternalContent(
  payload: string,
  source: string,
  contentType: FileFormat = "mixed"
): IngestResult {
  if (!requiresFiltering(source)) {
    return { allowed: true };
  }

  let filterResult: FilterResult;
  try {
    filterResult = filterContentString(
      payload,
      `blackboard-ingestion:${source}`,
      contentType
    );
  } catch (err) {
    // Fail-closed: if the filter itself errors, block the content
    throw new BlackboardError(
      `Content filter error: ${err instanceof Error ? err.message : String(err)}`,
      "CONTENT_FILTER_ERROR"
    );
  }

  if (filterResult.decision === "BLOCKED") {
    const reasons = filterResult.matches
      .map((m) => `${m.pattern_name} (${m.category})`)
      .join(", ");
    throw new BlackboardError(
      `Content blocked by security filter: ${reasons || "policy violation"}`,
      "CONTENT_BLOCKED"
    );
  }

  if (filterResult.decision === "HUMAN_REVIEW") {
    return {
      allowed: true,
      metadata: {
        human_review_required: true,
        filter_decision: "HUMAN_REVIEW",
        filter_matches: filterResult.matches.map((m) => ({
          pattern_id: m.pattern_id,
          category: m.category,
          severity: m.severity,
        })),
      },
    };
  }

  return { allowed: true };
}

/**
 * Merge ingestion filter metadata into existing work item metadata.
 * If the filter flagged content for review, adds human_review_required: true
 * and the filter match details.
 */
export function mergeFilterMetadata(
  existingMetadata: string | null,
  ingestResult: IngestResult
): string | null {
  if (!ingestResult.metadata) {
    return existingMetadata;
  }

  let existing: Record<string, unknown> = {};
  if (existingMetadata) {
    try {
      existing = JSON.parse(existingMetadata);
    } catch {
      existing = {};
    }
  }

  const merged = { ...existing, ...ingestResult.metadata };
  return JSON.stringify(merged);
}
