import type { Database } from "bun:sqlite";
import { BlackboardError } from "./errors";
import type { SpecFlowFeature, SpecFlowFeaturePhase, SpecFlowFeatureStatus } from "./types";

export interface CreateFeatureInput {
  feature_id: string;
  project_id: string;
  title: string;
  description?: string;
  phase?: SpecFlowFeaturePhase;
  status?: SpecFlowFeatureStatus;
  main_branch?: string;
  max_failures?: number;
  source?: string;
  source_ref?: string;
  github_issue_number?: number;
  github_issue_url?: string;
  github_repo?: string;
}

export interface ListFeaturesOptions {
  projectId?: string;
  phase?: string;
  status?: string;
}

/**
 * Create a new specflow feature row.
 */
export function createFeature(
  db: Database,
  input: CreateFeatureInput
): SpecFlowFeature {
  const now = new Date().toISOString();
  const phase = input.phase ?? "queued";
  const status = input.status ?? "pending";
  const main_branch = input.main_branch ?? "main";
  const max_failures = input.max_failures ?? 3;
  const source = input.source ?? "specflow";

  try {
    db.query(`
      INSERT INTO specflow_features (
        feature_id, project_id, title, description,
        phase, status, main_branch, max_failures,
        source, source_ref,
        github_issue_number, github_issue_url, github_repo,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?,
        ?, ?
      )
    `).run(
      input.feature_id,
      input.project_id,
      input.title,
      input.description ?? null,
      phase,
      status,
      main_branch,
      max_failures,
      source,
      input.source_ref ?? null,
      input.github_issue_number ?? null,
      input.github_issue_url ?? null,
      input.github_repo ?? null,
      now,
      now
    );
  } catch (err: any) {
    if (err.message?.includes("UNIQUE constraint")) {
      throw new BlackboardError(
        `SpecFlow feature already exists: ${input.feature_id}`,
        "FEATURE_EXISTS"
      );
    }
    throw err;
  }

  return getFeature(db, input.feature_id)!;
}

/**
 * Get a single specflow feature by ID. Returns null if not found.
 */
export function getFeature(
  db: Database,
  featureId: string
): SpecFlowFeature | null {
  return db.query(
    "SELECT * FROM specflow_features WHERE feature_id = ?"
  ).get(featureId) as SpecFlowFeature | null;
}

/**
 * Update fields on an existing specflow feature.
 * Always sets updated_at to now.
 * Returns the updated feature row.
 */
export function updateFeature(
  db: Database,
  featureId: string,
  updates: Partial<Omit<SpecFlowFeature, "feature_id" | "created_at">>
): SpecFlowFeature {
  const now = new Date().toISOString();

  const existing = getFeature(db, featureId);
  if (!existing) {
    throw new BlackboardError(
      `SpecFlow feature not found: ${featureId}`,
      "FEATURE_NOT_FOUND"
    );
  }

  // Build SET clause dynamically from provided updates
  const allowed = [
    "project_id", "title", "description",
    "phase", "status", "current_session",
    "worktree_path", "branch_name", "main_branch",
    "failure_count", "max_failures",
    "last_error", "last_phase_error",
    "specify_score", "plan_score", "implement_score",
    "pr_number", "pr_url", "commit_sha",
    "github_issue_number", "github_issue_url", "github_repo",
    "source", "source_ref",
    "phase_started_at", "completed_at",
  ];

  const setClauses: string[] = ["updated_at = ?"];
  const values: unknown[] = [now];

  for (const key of allowed) {
    if (key in updates) {
      setClauses.push(`${key} = ?`);
      values.push((updates as Record<string, unknown>)[key] ?? null);
    }
  }

  values.push(featureId);

  db.query(
    `UPDATE specflow_features SET ${setClauses.join(", ")} WHERE feature_id = ?`
  ).run(...values);

  return getFeature(db, featureId)!;
}

/**
 * List specflow features with optional filters.
 */
export function listFeatures(
  db: Database,
  opts?: ListFeaturesOptions
): SpecFlowFeature[] {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (opts?.projectId) {
    conditions.push("project_id = ?");
    values.push(opts.projectId);
  }
  if (opts?.phase) {
    conditions.push("phase = ?");
    values.push(opts.phase);
  }
  if (opts?.status) {
    conditions.push("status = ?");
    values.push(opts.status);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return db.query(
    `SELECT * FROM specflow_features ${where} ORDER BY updated_at DESC`
  ).all(...values) as SpecFlowFeature[];
}

/**
 * Return features the orchestrator can act on next heartbeat cycle.
 *
 * Actionable = not permanently done (completed, blocked) AND not at max failures.
 * Ordered by: active first (may need timeout release), then pending by phase order.
 *
 * @param maxConcurrent - cap on how many active sessions to allow at once
 */
export function getActionableFeatures(
  db: Database,
  maxConcurrent: number
): SpecFlowFeature[] {
  // Active features that may need a timeout check — always include them
  const active = db.query(`
    SELECT * FROM specflow_features
    WHERE status = 'active'
    ORDER BY phase_started_at ASC
  `).all() as SpecFlowFeature[];

  // Pending features that can be dispatched (not failed-out, not completed/blocked)
  const slots = Math.max(0, maxConcurrent - active.length);
  const pending = slots > 0
    ? db.query(`
        SELECT * FROM specflow_features
        WHERE status = 'pending'
          AND phase NOT IN ('completed', 'blocked')
          AND failure_count < max_failures
        ORDER BY updated_at ASC
        LIMIT ?
      `).all(slots) as SpecFlowFeature[]
    : [];

  // Features that exceeded max_failures but haven't been marked failed yet
  const overLimit = db.query(`
    SELECT * FROM specflow_features
    WHERE status NOT IN ('failed', 'blocked', 'succeeded')
      AND phase NOT IN ('completed', 'blocked')
      AND failure_count >= max_failures
  `).all() as SpecFlowFeature[];

  return [...active, ...pending, ...overLimit];
}
