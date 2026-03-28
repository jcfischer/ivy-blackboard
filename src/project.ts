import type { Database } from "bun:sqlite";
import { BlackboardError } from "./errors";
import { sanitizeText } from "./sanitize";
import type { BlackboardAgent, BlackboardProject, BlackboardWorkItem, ProjectWorkflowMetadata } from "./types";
import { forceCompleteWorkItem, deleteWorkItem } from "./work";

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
  updated: boolean;
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
 * Register or update a project (upsert).
 * If the project doesn't exist, inserts and emits project_registered.
 * If it already exists, updates provided fields and emits project_updated.
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

  const existing = db
    .query("SELECT * FROM projects WHERE project_id = ?")
    .get(opts.id) as BlackboardProject | null;

  if (existing) {
    // Update: only overwrite fields that were explicitly provided
    const updatedName = displayName;
    const updatedPath = opts.path !== undefined ? localPath : existing.local_path;
    const updatedRepo = opts.repo !== undefined ? remoteRepo : existing.remote_repo;
    const updatedMetadata = opts.metadata !== undefined ? metadata : existing.metadata;

    db.transaction(() => {
      db.query(`
        UPDATE projects
        SET display_name = ?, local_path = ?, remote_repo = ?, metadata = ?
        WHERE project_id = ?
      `).run(updatedName, updatedPath, updatedRepo, updatedMetadata, opts.id);

      const summary = `Project "${updatedName}" updated`;
      db.query(`
        INSERT INTO events (timestamp, event_type, actor_id, target_id, target_type, summary)
        VALUES (?, 'project_updated', NULL, ?, 'project', ?)
      `).run(now, opts.id, summary);
    })();

    return {
      project_id: opts.id,
      display_name: updatedName,
      local_path: updatedPath,
      remote_repo: updatedRepo,
      registered_at: existing.registered_at,
      updated: true,
    };
  }

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

  return {
    project_id: opts.id,
    display_name: displayName,
    local_path: localPath,
    remote_repo: remoteRepo,
    registered_at: now,
    updated: false,
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
        MAX(COALESCE(a.last_seen_at, w.created_at, p.registered_at)) as last_activity
      FROM projects p
      LEFT JOIN agents a ON a.project = p.project_id
      LEFT JOIN work_items w ON w.project_id = p.project_id
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

export interface RemoveProjectResult {
  project_id: string;
  display_name: string;
  removed: boolean;
  work_items_completed: number;
  work_items_deleted: number;
  agents_deregistered: number;
}

/**
 * Remove a project from the blackboard.
 * - Refuses if claimed or in-progress work items exist (unless force=true)
 * - With force=true: force-completes claimed work, deletes available work
 * - Deregisters all agents for the project
 * - Cleans up heartbeat references
 * - Deletes the project record
 * - Emits project_removed event
 */
export function removeProject(
  db: Database,
  projectId: string,
  force: boolean = false
): RemoveProjectResult {
  const project = db
    .query("SELECT * FROM projects WHERE project_id = ?")
    .get(projectId) as BlackboardProject | null;

  if (!project) {
    throw new BlackboardError(
      `Project not found: ${projectId}`,
      "PROJECT_NOT_FOUND"
    );
  }

  // Check for active work items
  const claimedWork = db
    .query("SELECT item_id, status FROM work_items WHERE project_id = ? AND status IN ('claimed', 'in_progress')")
    .all(projectId) as Array<{ item_id: string; status: string }>;

  if (claimedWork.length > 0 && !force) {
    const itemList = claimedWork.map(w => w.item_id).join(", ");
    throw new BlackboardError(
      `Project has ${claimedWork.length} claimed/in-progress work items (${itemList}). Use --force to override.`,
      "PROJECT_HAS_ACTIVE_WORK"
    );
  }

  const now = new Date().toISOString();
  let completedCount = 0;
  let deletedCount = 0;
  let agentsCount = 0;

  db.transaction(() => {
    // Clean up work items (must happen before deleting project due to foreign key)
    const allWorkItems = db
      .query("SELECT item_id, status FROM work_items WHERE project_id = ?")
      .all(projectId) as Array<{ item_id: string; status: string }>;

    for (const item of allWorkItems) {
      if (item.status === "claimed" || item.status === "in_progress") {
        // Force-complete claimed work to preserve history
        forceCompleteWorkItem(db, item.item_id);
        completedCount++;
      } else if (item.status !== "completed") {
        // Delete available/blocked/failed work
        deleteWorkItem(db, item.item_id, true);
        deletedCount++;
      }
      // Leave completed items as-is (they're already done)
    }

    // Delete all remaining work items (including completed ones) to satisfy foreign key constraint
    db.query("DELETE FROM work_items WHERE project_id = ?").run(projectId);

    // Deregister all agents for this project
    const agents = db
      .query("SELECT session_id FROM agents WHERE project = ?")
      .all(projectId) as Array<{ session_id: string }>;

    for (const agent of agents) {
      db.query(
        "UPDATE agents SET status = 'completed' WHERE session_id = ?"
      ).run(agent.session_id);
      agentsCount++;
    }

    // Clean up heartbeat references (work items are already deleted)
    db.query(
      "UPDATE heartbeats SET work_item_id = NULL WHERE session_id IN (SELECT session_id FROM agents WHERE project = ?)"
    ).run(projectId);

    // Delete the project record
    db.query("DELETE FROM projects WHERE project_id = ?").run(projectId);

    // Emit project_removed event
    const summary = `Project "${project.display_name}" (${projectId}) removed${force ? " (forced)" : ""}`;
    db.query(
      "INSERT INTO events (timestamp, event_type, actor_id, target_id, target_type, summary) VALUES (?, 'project_removed', NULL, ?, 'project', ?)"
    ).run(now, projectId, summary);
  })();

  return {
    project_id: projectId,
    display_name: project.display_name,
    removed: true,
    work_items_completed: completedCount,
    work_items_deleted: deletedCount,
    agents_deregistered: agentsCount,
  };
}

export interface UpdateProjectMetadataResult {
  project_id: string;
  display_name: string;
  updated: boolean;
  metadata: Record<string, unknown>;
}

/**
 * Update project metadata by merging new keys into existing JSON.
 * Does not replace the entire metadata object - only updates provided keys.
 * Validates JSON structure before updating.
 * Emits project_updated event.
 */
export function updateProjectMetadata(
  db: Database,
  projectId: string,
  updates: Record<string, unknown>
): UpdateProjectMetadataResult {
  const project = db
    .query("SELECT * FROM projects WHERE project_id = ?")
    .get(projectId) as BlackboardProject | null;

  if (!project) {
    throw new BlackboardError(
      `Project not found: ${projectId}`,
      "PROJECT_NOT_FOUND"
    );
  }

  // Parse existing metadata or start with empty object
  let existing: Record<string, unknown> = {};
  if (project.metadata) {
    try {
      existing = JSON.parse(project.metadata);
    } catch {
      // If existing metadata is corrupt, start fresh
      existing = {};
    }
  }

  // Merge: new keys override existing
  const merged = { ...existing, ...updates };
  const mergedJson = JSON.stringify(merged);

  const now = new Date().toISOString();
  const changedKeys = Object.keys(updates);

  db.transaction(() => {
    db.query(
      "UPDATE projects SET metadata = ? WHERE project_id = ?"
    ).run(mergedJson, projectId);

    const summary = `Project "${project.display_name}" metadata updated: ${changedKeys.join(", ")}`;
    db.query(
      "INSERT INTO events (timestamp, event_type, actor_id, target_id, target_type, summary) VALUES (?, 'project_updated', NULL, ?, 'project', ?)"
    ).run(now, projectId, summary);
  })();

  return {
    project_id: projectId,
    display_name: project.display_name,
    updated: true,
    metadata: merged,
  };
}
