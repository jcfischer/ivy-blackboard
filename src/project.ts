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
        COUNT(CASE WHEN a.status IN ('active', 'idle') THEN 1 END) as active_agents
      FROM projects p
      LEFT JOIN agents a ON a.project = p.project_id
      GROUP BY p.project_id
      ORDER BY p.registered_at DESC
    `)
    .all() as ProjectWithCounts[];
}
