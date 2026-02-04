import type { Database } from "bun:sqlite";
import { BlackboardError } from "./errors";
import { sanitizeText } from "./sanitize";
import type { BlackboardAgent, BlackboardProject, BlackboardWorkItem } from "./types";

export interface RegisterProjectOptions {
  id: string;
  name: string;
  path?: string;
  repo?: string;
  metadata?: string;
}

export interface RegisterProjectResult {
  project_id: string;
  display_name: string;
  local_path: string | null;
  remote_repo: string | null;
  registered_at: string;
}

export interface ProjectWithCounts {
  project_id: string;
  display_name: string;
  local_path: string | null;
  remote_repo: string | null;
  registered_at: string;
  metadata: string | null;
  active_agents: number;
  work_available: number;
  work_claimed: number;
  work_completed: number;
  work_blocked: number;
  last_activity: string | null;
}

/**
 * Register a new project.
 * Inserts project row and emits project_registered event in one transaction.
 */
export function registerProject(
  db: Database,
  opts: RegisterProjectOptions
): RegisterProjectResult {
  const now = new Date().toISOString();
  const displayName = sanitizeText(opts.name);
  const localPath = opts.path ?? null;
  const remoteRepo = opts.repo ?? null;
  let metadata: string | null = null;

  if (opts.metadata) {
    try {
      JSON.parse(opts.metadata);
      metadata = opts.metadata;
    } catch {
      throw new BlackboardError(
        `Invalid JSON in metadata: ${opts.metadata}`,
        "INVALID_METADATA"
      );
    }
  }

  try {
    db.transaction(() => {
      db.query(`
        INSERT INTO projects (project_id, display_name, local_path, remote_repo, registered_at, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(opts.id, displayName, localPath, remoteRepo, now, metadata);

      const summary = `Project "${displayName}" registered as "${opts.id}"`;
      db.query(`
        INSERT INTO events (timestamp, event_type, actor_id, target_id, target_type, summary)
        VALUES (?, 'project_registered', NULL, ?, 'project', ?)
      `).run(now, opts.id, summary);
    })();
  } catch (err: any) {
    if (err.code === "INVALID_METADATA") throw err;
    if (err.message?.includes("UNIQUE constraint")) {
      throw new BlackboardError(
        `Project already exists: ${opts.id}`,
        "PROJECT_EXISTS"
      );
    }
    throw err;
  }

  return {
    project_id: opts.id,
    display_name: displayName,
    local_path: localPath,
    remote_repo: remoteRepo,
    registered_at: now,
  };
}

export interface ProjectStatus {
  project: BlackboardProject;
  agents: BlackboardAgent[];
  work_items: BlackboardWorkItem[];
}

/**
 * Get detailed project status with agents and work items.
 * Throws PROJECT_NOT_FOUND if the project doesn't exist.
 */
export function getProjectStatus(
  db: Database,
  projectId: string
): ProjectStatus {
  const project = db
    .query("SELECT * FROM projects WHERE project_id = ?")
    .get(projectId) as BlackboardProject | null;

  if (!project) {
    throw new BlackboardError(
      `Project not found: ${projectId}`,
      "PROJECT_NOT_FOUND"
    );
  }

  const agents = db
    .query(
      "SELECT * FROM agents WHERE project = ? AND status IN ('active', 'idle') ORDER BY started_at ASC"
    )
    .all(projectId) as BlackboardAgent[];

  const workItems = db
    .query(
      "SELECT * FROM work_items WHERE project_id = ? ORDER BY created_at DESC"
    )
    .all(projectId) as BlackboardWorkItem[];

  return {
    project,
    agents,
    work_items: workItems,
  };
}

/**
 * List all projects with active agent counts.
 */
export function listProjects(db: Database): ProjectWithCounts[] {
  return db
    .query(`
      SELECT
        p.project_id,
        p.display_name,
        p.local_path,
        p.remote_repo,
        p.registered_at,
        p.metadata,
        COUNT(DISTINCT CASE WHEN a.status IN ('active', 'idle') THEN a.session_id END) as active_agents,
        COUNT(DISTINCT CASE WHEN w.status = 'available' THEN w.item_id END) as work_available,
        COUNT(DISTINCT CASE WHEN w.status = 'claimed' THEN w.item_id END) as work_claimed,
        COUNT(DISTINCT CASE WHEN w.status = 'completed' THEN w.item_id END) as work_completed,
        COUNT(DISTINCT CASE WHEN w.status = 'blocked' THEN w.item_id END) as work_blocked,
        MAX(e.timestamp) as last_activity
      FROM projects p
      LEFT JOIN agents a ON a.project = p.project_id
      LEFT JOIN work_items w ON w.project_id = p.project_id
      LEFT JOIN events e ON e.target_id = p.project_id OR e.actor_id IN (
        SELECT session_id FROM agents WHERE project = p.project_id
      )
      GROUP BY p.project_id
      ORDER BY last_activity DESC NULLS LAST, p.registered_at DESC
    `)
    .all() as ProjectWithCounts[];
}

export interface ProjectDetail {
  project: BlackboardProject;
  agents: BlackboardAgent[];
  work_items: BlackboardWorkItem[];
  events: Array<{
    id: number;
    timestamp: string;
    event_type: string;
    actor_id: string | null;
    target_id: string | null;
    summary: string;
  }>;
  stats: {
    total_work: number;
    completed_work: number;
    completion_rate: number;
    active_agents: number;
    total_agents: number;
    last_activity: string | null;
  };
}

/**
 * Get full project detail with agents, work items, events, and stats.
 * Returns all agents (including completed/stale) for historical view.
 */
export function getProjectDetail(
  db: Database,
  projectId: string
): ProjectDetail {
  const project = db
    .query("SELECT * FROM projects WHERE project_id = ?")
    .get(projectId) as BlackboardProject | null;

  if (!project) {
    throw new BlackboardError(
      `Project not found: ${projectId}`,
      "PROJECT_NOT_FOUND"
    );
  }

  const agents = db
    .query(
      "SELECT * FROM agents WHERE project = ? ORDER BY last_seen_at DESC"
    )
    .all(projectId) as BlackboardAgent[];

  const workItems = db
    .query(
      "SELECT * FROM work_items WHERE project_id = ? ORDER BY CASE status WHEN 'claimed' THEN 0 WHEN 'available' THEN 1 WHEN 'blocked' THEN 2 WHEN 'completed' THEN 3 END, created_at DESC"
    )
    .all(projectId) as BlackboardWorkItem[];

  // Get events related to this project: project events + agent events + work item events
  const agentIds = agents.map(a => a.session_id);
  const workItemIds = workItems.map(w => w.item_id);

  let events: ProjectDetail["events"] = [];
  if (agentIds.length > 0 || workItemIds.length > 0) {
    const placeholders = [...agentIds, ...workItemIds, projectId]
      .map(() => "?")
      .join(",");
    events = db
      .query(
        `SELECT id, timestamp, event_type, actor_id, target_id, summary
         FROM events
         WHERE actor_id IN (${placeholders})
            OR target_id IN (${placeholders})
         ORDER BY timestamp DESC
         LIMIT 50`
      )
      .all(
        ...agentIds, ...workItemIds, projectId,
        ...agentIds, ...workItemIds, projectId
      ) as ProjectDetail["events"];
  } else {
    // Only project-level events
    events = db
      .query(
        `SELECT id, timestamp, event_type, actor_id, target_id, summary
         FROM events
         WHERE target_id = ?
         ORDER BY timestamp DESC
         LIMIT 50`
      )
      .all(projectId) as ProjectDetail["events"];
  }

  const totalWork = workItems.length;
  const completedWork = workItems.filter(w => w.status === "completed").length;
  const activeAgents = agents.filter(
    a => a.status === "active" || a.status === "idle"
  ).length;

  return {
    project,
    agents,
    work_items: workItems,
    events,
    stats: {
      total_work: totalWork,
      completed_work: completedWork,
      completion_rate: totalWork > 0 ? Math.round((completedWork / totalWork) * 100) : 0,
      active_agents: activeAgents,
      total_agents: agents.length,
      last_activity: events.length > 0 ? events[0].timestamp : null,
    },
  };
}
