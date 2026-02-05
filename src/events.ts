import type { Database } from "bun:sqlite";
import { BlackboardError } from "./errors";
import { type BlackboardEvent } from "./types";

export interface ObserveEventsOptions {
  since?: string;
  type?: string;
  session?: string;
  limit?: number;
}

/**
 * Parse duration string (e.g., "1h", "30m", "2d") to seconds.
 */
export function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new BlackboardError(
      `Invalid duration format: "${duration}". Use <number><s|m|h|d> (e.g., 1h, 30m, 2d)`,
      "INVALID_DURATION"
    );
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  };

  return value * multipliers[unit];
}

/**
 * Query events with optional filters.
 * Default: ORDER BY timestamp ASC LIMIT 50.
 */
export function observeEvents(
  db: Database,
  opts?: ObserveEventsOptions
): BlackboardEvent[] {
  const conditions: string[] = [];
  const params: any[] = [];

  if (opts?.since) {
    const seconds = parseDuration(opts.since);
    const cutoff = new Date(Date.now() - seconds * 1000).toISOString();
    conditions.push("timestamp >= ?");
    params.push(cutoff);
  }

  if (opts?.type) {
    const types = opts.type.split(",").map((t) => t.trim());
    const placeholders = types.map(() => "?").join(", ");
    conditions.push(`event_type IN (${placeholders})`);
    params.push(...types);
  }

  if (opts?.session) {
    conditions.push("(actor_id = ? OR actor_id LIKE ? || '%')");
    params.push(opts.session, opts.session);
  }

  const limit = opts?.limit ?? 50;
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  // When filtering by 'since', return chronological order (ASC) for streaming/tailing.
  // Otherwise return most recent events first (DESC) for dashboard/overview use.
  const order = opts?.since ? "ASC" : "DESC";
  const sql = `SELECT * FROM events ${where} ORDER BY timestamp ${order} LIMIT ?`;
  params.push(limit);

  return db.query(sql).all(...params) as BlackboardEvent[];
}
