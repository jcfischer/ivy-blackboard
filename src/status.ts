import { statSync } from "node:fs";
import type { Database } from "bun:sqlite";

export interface OverallStatus {
  database: string;
  database_size: string;
  agents: Record<string, number>;
  projects: number;
  work_items: Record<string, number>;
  events_24h: number;
  active_agents: Array<{
    session_id: string;
    agent_name: string;
    project: string | null;
    current_work: string | null;
    last_seen_at: string;
  }>;
}

/**
 * Format bytes to human-readable size string.
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Get overall blackboard status.
 */
export function getOverallStatus(
  db: Database,
  dbPath: string
): OverallStatus {
  const agentCounts = db
    .query("SELECT status, COUNT(*) as count FROM agents GROUP BY status")
    .all() as { status: string; count: number }[];

  const workCounts = db
    .query("SELECT status, COUNT(*) as count FROM work_items GROUP BY status")
    .all() as { status: string; count: number }[];

  const projectCount = (
    db.query("SELECT COUNT(*) as count FROM projects").get() as { count: number }
  ).count;

  const eventCount = (
    db
      .query(
        "SELECT COUNT(*) as count FROM events WHERE timestamp >= ?"
      )
      .get(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) as { count: number }
  ).count;

  const activeAgents = db
    .query(
      "SELECT session_id, agent_name, project, current_work, last_seen_at FROM agents WHERE status = 'active'"
    )
    .all() as OverallStatus["active_agents"];

  let dbSize = "unknown";
  try {
    const stat = statSync(dbPath);
    dbSize = formatSize(stat.size);
  } catch {
    // File may not exist or be inaccessible
  }

  return {
    database: dbPath,
    database_size: dbSize,
    agents: Object.fromEntries(agentCounts.map((a) => [a.status, a.count])),
    projects: projectCount,
    work_items: Object.fromEntries(workCounts.map((w) => [w.status, w.count])),
    events_24h: eventCount,
    active_agents: activeAgents,
  };
}
