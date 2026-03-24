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
  /** Comma-separated feature IDs this feature depends on. Use `projectId:featureId` for cross-project deps. */
  dependsOn?: string;
}

export interface ListFeaturesOptions {
  projectId?: string;
  phase?: string;
  status?: string;
}

/**
 * Parse a dependency reference into a bare feature_id.
 * Supports both `featureId` (same-project) and `projectId:featureId` (cross-project).
 * The blackboard uses a global feature_id namespace so we look up by the bare ID.
 */
export function parseDependencyId(ref: string): string {
  const colonIdx = ref.indexOf(":");
  return colonIdx === -1 ? ref : ref.slice(colonIdx + 1);
}

/**
 * Check whether all dependency features of a feature are completed.
 *
 * @param db - Database connection
 * @param featureId - The feature whose dependencies to check (used to skip self-deps)
 * @param dependsOn - Raw depends_on string from input (may differ from DB value on create)
 * @returns true if all dependencies are in `completed` phase (or if there are none)
 */
export function checkFeatureDependenciesComplete(
  db: Database,
  featureId: string,
  dependsOn: string | null
): boolean {
  if (!dependsOn) return true;

  const depIds = dependsOn.split(",")
    .map(s => parseDependencyId(s.trim()))
    .filter(id => id && id !== featureId); // drop empty and self-references
  if (depIds.length === 0) return true;

  // Single batched query instead of one per dependency
  const placeholders = depIds.map(() => "?").join(", ");
  const rows = db.query(
    `SELECT feature_id FROM specflow_features WHERE feature_id IN (${placeholders}) AND phase = 'completed'`
  ).all(...depIds) as { feature_id: string }[];

  return rows.length === depIds.length;
}

/**
 * Unblock all features that depend on the given completed feature, if all their
 * other dependencies are also now completed. Returns the count of features unblocked.
 */
export function unblockDependentFeatures(
  db: Database,
  completedFeatureId: string
): number {
  // Pre-filter with LIKE to skip blocked features that couldn't possibly match
  const candidates = db.query(
    "SELECT * FROM specflow_features WHERE status = 'blocked' AND depends_on LIKE ?"
  ).all(`%${completedFeatureId}%`) as SpecFlowFeature[];

  const now = new Date().toISOString();
  let unblocked = 0;

  for (const feature of candidates) {
    const depIds = feature.depends_on!
      .split(",")
      .map(s => parseDependencyId(s.trim()))
      .filter(Boolean);

    // Only process features that actually depend on the completed feature
    if (!depIds.includes(completedFeatureId)) continue;

    // Check if all dependencies are now complete
    if (checkFeatureDependenciesComplete(db, feature.feature_id, feature.depends_on)) {
      db.query(
        "UPDATE specflow_features SET status = 'pending', updated_at = ? WHERE feature_id = ?"
      ).run(now, feature.feature_id);
      unblocked++;
    }
  }

  return unblocked;
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
  const dependsOn = input.dependsOn ?? null;
  // Start blocked if dependencies are specified and not all completed
  const initialStatus = input.status
    ?? (dependsOn && !checkFeatureDependenciesComplete(db, input.feature_id, dependsOn)
        ? "blocked"
        : "pending");
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
        depends_on,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?,
        ?,
        ?, ?
      )
    `).run(
      input.feature_id,
      input.project_id,
      input.title,
      input.description ?? null,
      phase,
      initialStatus,
      main_branch,
      max_failures,
      source,
      input.source_ref ?? null,
      input.github_issue_number ?? null,
      input.github_issue_url ?? null,
      input.github_repo ?? null,
      dependsOn,
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
    "depends_on",
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
 * Upsert a specflow feature — create if not exists, otherwise update mutable fields.
 * Used by the scheduler to track cross-project features as work items are dispatched.
 */
export function upsertFeature(
  db: Database,
  input: CreateFeatureInput
): SpecFlowFeature {
  const existing = getFeature(db, input.feature_id);
  if (!existing) {
    return createFeature(db, input);
  }
  // Update only the fields that were explicitly provided
  const updates: Partial<Omit<SpecFlowFeature, "feature_id" | "created_at">> = {};
  if (input.title) updates.title = input.title;
  if (input.phase) updates.phase = input.phase as SpecFlowFeaturePhase;
  if (input.status) updates.status = input.status as SpecFlowFeatureStatus;
  if (input.project_id) updates.project_id = input.project_id;
  if (input.github_repo) updates.github_repo = input.github_repo;
  if (input.main_branch) updates.main_branch = input.main_branch;
  if (input.description) updates.description = input.description;
  if (input.dependsOn !== undefined) updates.depends_on = input.dependsOn ?? null;
  return updateFeature(db, input.feature_id, updates);
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

  // Succeeded *ing phases that need a gate check (resilience: picks up after restart)
  const awaitingGate = db.query(`
    SELECT * FROM specflow_features
    WHERE status = 'succeeded'
      AND phase LIKE '%ing'
      AND phase NOT IN ('completed', 'blocked')
  `).all() as SpecFlowFeature[];

  // Features that exceeded max_failures but haven't been marked failed yet
  const overLimit = db.query(`
    SELECT * FROM specflow_features
    WHERE status NOT IN ('failed', 'blocked', 'succeeded')
      AND phase NOT IN ('completed', 'blocked')
      AND failure_count >= max_failures
  `).all() as SpecFlowFeature[];

  return [...active, ...pending, ...awaitingGate, ...overLimit];
}
