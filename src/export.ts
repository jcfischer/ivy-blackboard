import type { Database } from "bun:sqlite";
import { getOverallStatus } from "./status";
import { listAgents } from "./agent";
import { listProjects } from "./project";
import { listWorkItems } from "./work";
import { observeEvents } from "./events";
import type { BlackboardAgent, BlackboardWorkItem, BlackboardEvent } from "./types";
import type { ProjectWithCounts } from "./project";
import type { OverallStatus } from "./status";

export interface ExportSnapshot {
  export_version: 1;
  exported_at: string;
  status: OverallStatus;
  agents: BlackboardAgent[];
  projects: ProjectWithCounts[];
  work_items: BlackboardWorkItem[];
  recent_events: BlackboardEvent[];
}

export interface ExportOptions {
  pretty?: boolean;
  eventLimit?: number;
}

/**
 * Export a complete snapshot of the blackboard state.
 */
export function exportSnapshot(
  db: Database,
  dbPath: string,
  opts?: ExportOptions
): ExportSnapshot {
  return {
    export_version: 1,
    exported_at: new Date().toISOString(),
    status: getOverallStatus(db, dbPath),
    agents: listAgents(db, { all: true }),
    projects: listProjects(db),
    work_items: listWorkItems(db, { all: true }),
    recent_events: observeEvents(db, { since: "24h", limit: opts?.eventLimit ?? 100 }),
  };
}

/**
 * Serialize a snapshot to JSON string.
 */
export function serializeSnapshot(
  snapshot: ExportSnapshot,
  pretty?: boolean
): string {
  return JSON.stringify(snapshot, null, pretty ? 2 : undefined);
}
