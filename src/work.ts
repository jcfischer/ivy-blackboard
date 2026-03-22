import type { Database } from "bun:sqlite";
import { BlackboardError } from "./errors";
import { sanitizeText } from "./sanitize";
import { ingestExternalContent, mergeFilterMetadata, requiresFiltering } from "./ingestion";
import { WORK_ITEM_PRIORITIES, WORK_ITEM_STATUSES, KNOWN_EVENT_TYPES } from "./types";
import type { BlackboardWorkItem, BlackboardEvent, KnownEventType } from "./types";

export interface CreateWorkItemOptions {
  id: string;
  title: string;
  description?: string;
  project?: string | null;
  source?: string;
  sourceRef?: string;
  priority?: string;
  metadata?: string;
  dependsOn?: string;
}

/**
 * Validate dependency IDs and determine initial status.
 * Returns "blocked" if any dependencies are incomplete, "available" otherwise.
 */
function validateDependenciesAndGetStatus(
  db: Database,
  itemId: string,
  dependsOn: string | null
): string {
  if (!dependsOn) {
    return "available";
  }

  const depIds = dependsOn.split(",").map(id => id.trim()).filter(Boolean);

  // Detect direct circular dependencies (check before existence validation)
  if (depIds.includes(itemId)) {
    throw new BlackboardError(
      `Circular dependency detected: ${itemId} cannot depend on itself`,
      "CIRCULAR_DEPENDENCY"
    );
  }

  // Validate all dependency IDs exist
  for (const depId of depIds) {
    const dep = db.query("SELECT item_id FROM work_items WHERE item_id = ?").get(depId);
    if (!dep) {
      throw new BlackboardError(
        `Dependency not found: ${depId}`,
        "DEPENDENCY_NOT_FOUND"
      );
    }
  }

  // Check if all dependencies are complete
  const incompleteDeps = db.query(
    `SELECT item_id FROM work_items WHERE item_id IN (${depIds.map(() => '?').join(',')}) AND status != 'completed'`
  ).all(...depIds);

  return incompleteDeps.length > 0 ? "blocked" : "available";
}

/**
 * Check for items that depend on the given item and unblock them if all their dependencies are complete.
 */
function checkAndUnblockDependents(db: Database, completedItemId: string): void {
  // Find all blocked items that have this item in their depends_on list
  const blockedItems = db.query<BlackboardWorkItem>(
    "SELECT * FROM work_items WHERE status = 'blocked' AND depends_on IS NOT NULL"
  ).all();

  const now = new Date().toISOString();

  for (const item of blockedItems) {
    if (!item.depends_on) continue;

    const depIds = item.depends_on.split(",").map(id => id.trim()).filter(Boolean);

    // Check if this item depends on the completed item
    if (!depIds.includes(completedItemId)) continue;

    // Check if ALL dependencies are now complete
    const incompleteDeps = db.query(
      `SELECT item_id FROM work_items WHERE item_id IN (${depIds.map(() => '?').join(',')}) AND status != 'completed'`
    ).all(...depIds);

    if (incompleteDeps.length === 0) {
      // All dependencies are complete — unblock the item
      db.transaction(() => {
        db.query(
          "UPDATE work_items SET status = 'available' WHERE item_id = ?"
        ).run(item.item_id);

        const summary = `Work item "${item.title}" auto-unblocked (all dependencies complete)`;
        db.query(
          "INSERT INTO events (timestamp, event_type, actor_id, target_id, target_type, summary) VALUES (?, 'work_released', NULL, ?, 'work_item', ?)"
        ).run(now, item.item_id, summary);
      })();
    }
  }
}

export interface CreateWorkItemResult {
  item_id: string;
  title: string;
  status: string;
  claimed_by: string | null;
  claimed_at: string | null;
  created_at: string;
}

export interface ClaimWorkItemResult {
  item_id: string;
  claimed: boolean;
  claimed_by: string | null;
  claimed_at: string | null;
}

interface ValidatedWorkItemInputs {
  title: string;
  description: string | null;
  project: string | null;
  sourceRef: string | null;
  dependsOn: string | null;
  source: string;
  priority: string;
  metadata: string | null;
  initialStatus: string;
}

/**
 * Validate and prepare work item inputs.
 * Extracts shared validation logic used by both createWorkItem and createAndClaimWorkItem.
 */
function validateAndPrepareWorkItemInputs(
  db: Database,
  opts: CreateWorkItemOptions
): ValidatedWorkItemInputs {
  const title = sanitizeText(opts.title);
  const source = opts.source ?? "local";
  const priority = opts.priority ?? "P2";
  const description = opts.description ? sanitizeText(opts.description) : null;
  const project = opts.project ?? null;
  const sourceRef = opts.sourceRef ?? null;
  const dependsOn = opts.dependsOn ?? null;
  let metadata: string | null = null;

  if (!source || typeof source !== "string") {
    throw new BlackboardError(
      "Source must be a non-empty string",
      "INVALID_SOURCE"
    );
  }

  if (!WORK_ITEM_PRIORITIES.includes(priority as any)) {
    throw new BlackboardError(
      `Invalid priority "${priority}". Valid values: ${WORK_ITEM_PRIORITIES.join(", ")}`,
      "INVALID_PRIORITY"
    );
  }

  const initialStatus = validateDependenciesAndGetStatus(db, opts.id, dependsOn);

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

  if (requiresFiltering(source)) {
    const contentToScan = [title, description].filter(Boolean).join("\n");
    const ingestResult = ingestExternalContent(contentToScan, source, "mixed");
    metadata = mergeFilterMetadata(metadata, ingestResult);
  }

  return {
    title,
    description,
    project,
    sourceRef,
    dependsOn,
    source,
    priority,
    metadata,
    initialStatus
  };
}

/**
 * Shared helper to insert a work item and emit work_created event.
 * Used by both createWorkItem and createAndClaimWorkItem to avoid duplication.
 */
function insertWorkItemWithEvent(
  db: Database,
  opts: {
    id: string;
    validated: ValidatedWorkItemInputs;
    status: string;
    claimed_by?: string;
    claimed_at?: string;
    sessionId?: string;
  }
): void {
  const now = new Date().toISOString();
  const { id, validated, status, claimed_by = null, claimed_at = null, sessionId = null } = opts;

  db.transaction(() => {
    db.query(`
      INSERT INTO work_items (item_id, project_id, title, description, source, source_ref, status, priority, depends_on, claimed_by, claimed_at, created_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, validated.project, validated.title, validated.description, validated.source, validated.sourceRef, status, validated.priority, validated.dependsOn, claimed_by, claimed_at, now, validated.metadata);

    const summary = `Work item "${validated.title}" created as ${id}`;
    db.query(`
      INSERT INTO events (timestamp, event_type, actor_id, target_id, target_type, summary)
      VALUES (?, 'work_created', ?, ?, 'work_item', ?)
    `).run(now, sessionId, id, summary);
  })();
}

/**
 * Create a new work item.
 * Validates source/priority, inserts row, emits work_created event.
 */
export function createWorkItem(
  db: Database,
  opts: CreateWorkItemOptions
): CreateWorkItemResult {
  const now = new Date().toISOString();
  const validated = validateAndPrepareWorkItemInputs(db, opts);

  try {
    insertWorkItemWithEvent(db, {
      id: opts.id,
      validated,
      status: validated.initialStatus,
    });
  } catch (err: any) {
    if (err.code === "CONTENT_BLOCKED" || err.code === "CONTENT_FILTER_ERROR") throw err;
    if (err.code === "INVALID_SOURCE" || err.code === "INVALID_PRIORITY" || err.code === "INVALID_METADATA") throw err;
    if (err.message?.includes("UNIQUE constraint")) {
      throw new BlackboardError(
        `Work item already exists: ${opts.id}`,
        "WORK_ITEM_EXISTS"
      );
    }
    throw err;
  }

  return {
    item_id: opts.id,
    title: validated.title,
    status: validated.initialStatus,
    claimed_by: null,
    claimed_at: null,
    created_at: now,
  };
}

/**
 * Claim an existing available work item.
 * Atomic: UPDATE WHERE status='available' ensures no double-claim.
 */
export function claimWorkItem(
  db: Database,
  itemId: string,
  sessionId: string
): ClaimWorkItemResult {
  // Validate session exists
  const agent = db
    .query("SELECT session_id FROM agents WHERE session_id = ?")
    .get(sessionId) as { session_id: string } | null;

  if (!agent) {
    throw new BlackboardError(
      `Agent session not found: ${sessionId}`,
      "AGENT_NOT_FOUND"
    );
  }

  // Validate item exists
  const item = db
    .query("SELECT item_id, title FROM work_items WHERE item_id = ?")
    .get(itemId) as { item_id: string; title: string } | null;

  if (!item) {
    throw new BlackboardError(
      `Work item not found: ${itemId}`,
      "WORK_ITEM_NOT_FOUND"
    );
  }

  const now = new Date().toISOString();

  const result = db.query(`
    UPDATE work_items SET status = 'claimed', claimed_by = ?, claimed_at = ?
    WHERE item_id = ? AND status = 'available'
  `).run(sessionId, now, itemId);

  if (result.changes === 0) {
    return {
      item_id: itemId,
      claimed: false,
      claimed_by: null,
      claimed_at: null,
    };
  }

  // Emit event
  const summary = `Work item "${item.title}" claimed by agent ${sessionId.slice(0, 12)}`;
  db.query(`
    INSERT INTO events (timestamp, event_type, actor_id, target_id, target_type, summary)
    VALUES (?, 'work_claimed', ?, ?, 'work_item', ?)
  `).run(now, sessionId, itemId, summary);

  return {
    item_id: itemId,
    claimed: true,
    claimed_by: sessionId,
    claimed_at: now,
  };
}

/**
 * Create a work item and claim it in one transaction.
 */
export function createAndClaimWorkItem(
  db: Database,
  opts: CreateWorkItemOptions,
  sessionId: string
): CreateWorkItemResult {
  const now = new Date().toISOString();
  const validated = validateAndPrepareWorkItemInputs(db, opts);

  // Validate session exists
  const agent = db
    .query("SELECT session_id FROM agents WHERE session_id = ?")
    .get(sessionId) as { session_id: string } | null;

  if (!agent) {
    throw new BlackboardError(
      `Agent session not found: ${sessionId}`,
      "AGENT_NOT_FOUND"
    );
  }

  insertWorkItemWithEvent(db, {
    id: opts.id,
    validated,
    status: "claimed",
    claimed_by: sessionId,
    claimed_at: now,
    sessionId,
  });

  // Emit work_claimed event (work_created is already emitted by insertWorkItemWithEvent)
  const claimSummary = `Work item "${validated.title}" claimed by agent ${sessionId.slice(0, 12)}`;
  db.query(`
    INSERT INTO events (timestamp, event_type, actor_id, target_id, target_type, summary)
    VALUES (?, 'work_claimed', ?, ?, 'work_item', ?)
  `).run(now, sessionId, opts.id, claimSummary);

  return {
    item_id: opts.id,
    title: validated.title,
    status: "claimed",
    claimed_by: sessionId,
    claimed_at: now,
    created_at: now,
  };
}

export interface ReleaseWorkItemResult {
  item_id: string;
  released: boolean;
  previous_status: string;
}

export interface CompleteWorkItemResult {
  item_id: string;
  completed: boolean;
  completed_at: string;
  claimed_by: string;
}

export interface BlockWorkItemResult {
  item_id: string;
  blocked: boolean;
  blocked_by: string | null;
  previous_status: string;
}

export interface UnblockWorkItemResult {
  item_id: string;
  unblocked: boolean;
  restored_status: string;
}

/**
 * Release a claimed work item back to available.
 */
export function releaseWorkItem(
  db: Database,
  itemId: string,
  sessionId: string
): ReleaseWorkItemResult {
  const item = db
    .query("SELECT * FROM work_items WHERE item_id = ?")
    .get(itemId) as BlackboardWorkItem | null;

  if (!item) {
    throw new BlackboardError(`Work item not found: ${itemId}`, "WORK_ITEM_NOT_FOUND");
  }

  const agent = db
    .query("SELECT session_id FROM agents WHERE session_id = ?")
    .get(sessionId) as { session_id: string } | null;

  if (!agent) {
    throw new BlackboardError(`Agent session not found: ${sessionId}`, "AGENT_NOT_FOUND");
  }

  if (item.status === "completed") {
    throw new BlackboardError(`Work item already completed: ${itemId}`, "ALREADY_COMPLETED");
  }

  if (item.status !== "claimed") {
    throw new BlackboardError(`Work item is not claimed: ${itemId}`, "NOT_CLAIMED");
  }

  if (item.claimed_by !== sessionId) {
    throw new BlackboardError(`Work item not claimed by session: ${sessionId}`, "NOT_CLAIMED_BY_SESSION");
  }

  const now = new Date().toISOString();
  const previousStatus = item.status;

  db.transaction(() => {
    db.query(
      "UPDATE work_items SET status = 'available', claimed_by = NULL, claimed_at = NULL WHERE item_id = ?"
    ).run(itemId);

    const summary = `Work item "${item.title}" released by agent ${sessionId.slice(0, 12)}`;
    db.query(
      "INSERT INTO events (timestamp, event_type, actor_id, target_id, target_type, summary) VALUES (?, 'work_released', ?, ?, 'work_item', ?)"
    ).run(now, sessionId, itemId, summary);
  })();

  return { item_id: itemId, released: true, previous_status: previousStatus };
}

/**
 * Mark a claimed work item as completed.
 */
export function completeWorkItem(
  db: Database,
  itemId: string,
  sessionId: string
): CompleteWorkItemResult {
  const item = db
    .query("SELECT * FROM work_items WHERE item_id = ?")
    .get(itemId) as BlackboardWorkItem | null;

  if (!item) {
    throw new BlackboardError(`Work item not found: ${itemId}`, "WORK_ITEM_NOT_FOUND");
  }

  const agent = db
    .query("SELECT session_id FROM agents WHERE session_id = ?")
    .get(sessionId) as { session_id: string } | null;

  if (!agent) {
    throw new BlackboardError(`Agent session not found: ${sessionId}`, "AGENT_NOT_FOUND");
  }

  if (item.status === "completed") {
    throw new BlackboardError(`Work item already completed: ${itemId}`, "ALREADY_COMPLETED");
  }

  if (item.status !== "claimed") {
    throw new BlackboardError(`Work item is not claimed: ${itemId}`, "NOT_CLAIMED");
  }

  if (item.claimed_by !== sessionId) {
    throw new BlackboardError(`Work item not claimed by session: ${sessionId}`, "NOT_CLAIMED_BY_SESSION");
  }

  const now = new Date().toISOString();

  db.transaction(() => {
    db.query(
      "UPDATE work_items SET status = 'completed', completed_at = ? WHERE item_id = ?"
    ).run(now, itemId);

    const summary = `Work item "${item.title}" completed by agent ${sessionId.slice(0, 12)}`;
    db.query(
      "INSERT INTO events (timestamp, event_type, actor_id, target_id, target_type, summary) VALUES (?, 'work_completed', ?, ?, 'work_item', ?)"
    ).run(now, sessionId, itemId, summary);
  })();

  // Auto-unblock: check for items that depend on this completed item
  checkAndUnblockDependents(db, itemId);

  return { item_id: itemId, completed: true, completed_at: now, claimed_by: sessionId };
}

/**
 * Block a work item. Retains claimed_by if was claimed.
 */
export function blockWorkItem(
  db: Database,
  itemId: string,
  opts?: { blockedBy?: string }
): BlockWorkItemResult {
  const item = db
    .query("SELECT * FROM work_items WHERE item_id = ?")
    .get(itemId) as BlackboardWorkItem | null;

  if (!item) {
    throw new BlackboardError(`Work item not found: ${itemId}`, "WORK_ITEM_NOT_FOUND");
  }

  if (item.status === "completed") {
    throw new BlackboardError(`Work item already completed: ${itemId}`, "ALREADY_COMPLETED");
  }

  const now = new Date().toISOString();
  const previousStatus = item.status;
  const blockedBy = opts?.blockedBy ?? null;

  db.transaction(() => {
    db.query(
      "UPDATE work_items SET status = 'blocked', blocked_by = ? WHERE item_id = ?"
    ).run(blockedBy, itemId);

    const summary = `Work item "${item.title}" blocked${blockedBy ? ` by ${blockedBy}` : ""}`;
    db.query(
      "INSERT INTO events (timestamp, event_type, actor_id, target_id, target_type, summary) VALUES (?, 'work_blocked', NULL, ?, 'work_item', ?)"
    ).run(now, itemId, summary);
  })();

  return { item_id: itemId, blocked: true, blocked_by: blockedBy, previous_status: previousStatus };
}

/**
 * Unblock a blocked work item. Restores to claimed or available based on claimed_by.
 */
export function unblockWorkItem(
  db: Database,
  itemId: string
): UnblockWorkItemResult {
  const item = db
    .query("SELECT * FROM work_items WHERE item_id = ?")
    .get(itemId) as BlackboardWorkItem | null;

  if (!item) {
    throw new BlackboardError(`Work item not found: ${itemId}`, "WORK_ITEM_NOT_FOUND");
  }

  if (item.status !== "blocked" && item.status !== "waiting_for_response") {
    throw new BlackboardError(`Work item is not blocked: ${itemId}`, "NOT_BLOCKED");
  }

  const now = new Date().toISOString();
  const restoredStatus = item.claimed_by ? "claimed" : "available";

  db.transaction(() => {
    db.query(
      "UPDATE work_items SET status = ?, blocked_by = NULL WHERE item_id = ?"
    ).run(restoredStatus, itemId);

    const summary = `Work item "${item.title}" unblocked, restored to ${restoredStatus}`;
    db.query(
      "INSERT INTO events (timestamp, event_type, actor_id, target_id, target_type, summary) VALUES (?, 'work_released', NULL, ?, 'work_item', ?)"
    ).run(now, itemId, summary);
  })();

  return { item_id: itemId, unblocked: true, restored_status: restoredStatus };
}

export interface SetWaitingResult {
  item_id: string;
  waiting: boolean;
  previous_status: string;
}

/**
 * Set a work item to waiting_for_response status.
 * Used when a work item is blocked on an external dependency (e.g., cross-project issue).
 * Preserves claimed_by if was claimed.
 */
export function setWaitingForResponse(
  db: Database,
  itemId: string,
  opts?: { blockedBy?: string }
): SetWaitingResult {
  const item = db
    .query("SELECT * FROM work_items WHERE item_id = ?")
    .get(itemId) as BlackboardWorkItem | null;

  if (!item) {
    throw new BlackboardError(`Work item not found: ${itemId}`, "WORK_ITEM_NOT_FOUND");
  }

  if (item.status === "completed") {
    throw new BlackboardError(`Work item already completed: ${itemId}`, "ALREADY_COMPLETED");
  }

  const now = new Date().toISOString();
  const previousStatus = item.status;
  const blockedBy = opts?.blockedBy ?? null;

  db.transaction(() => {
    db.query(
      "UPDATE work_items SET status = 'waiting_for_response', blocked_by = ? WHERE item_id = ?"
    ).run(blockedBy, itemId);

    const summary = `Work item "${item.title}" set to waiting_for_response${blockedBy ? ` (blocked by ${blockedBy})` : ""}`;
    db.query(
      "INSERT INTO events (timestamp, event_type, actor_id, target_id, target_type, summary) VALUES (?, 'work_blocked', NULL, ?, 'work_item', ?)"
    ).run(now, itemId, summary);
  })();

  return { item_id: itemId, waiting: true, previous_status: previousStatus };
}

export interface DeleteWorkItemResult {
  item_id: string;
  deleted: boolean;
  title: string;
  previous_status: string;
  was_claimed_by: string | null;
}

/**
 * Delete a work item from the blackboard.
 * - Claimed items require force=true (agent is actively working)
 * - Completed items can be deleted without force (history cleanup)
 * - Cleans up heartbeat references before deletion
 * - Emits work_deleted event with item details
 */
export function deleteWorkItem(
  db: Database,
  itemId: string,
  force: boolean = false
): DeleteWorkItemResult {
  const item = db
    .query("SELECT * FROM work_items WHERE item_id = ?")
    .get(itemId) as BlackboardWorkItem | null;

  if (!item) {
    throw new BlackboardError(`Work item not found: ${itemId}`, "WORK_ITEM_NOT_FOUND");
  }

  if (item.status === "claimed" && !force) {
    throw new BlackboardError(
      `Work item is currently claimed by ${item.claimed_by}. Use --force to delete.`,
      "ITEM_CLAIMED"
    );
  }

  const now = new Date().toISOString();
  const previousStatus = item.status;
  const wasClaimed = item.claimed_by;

  db.transaction(() => {
    // Clean up heartbeat references
    db.query("UPDATE heartbeats SET work_item_id = NULL WHERE work_item_id = ?").run(itemId);

    // Delete the work item
    db.query("DELETE FROM work_items WHERE item_id = ?").run(itemId);

    // Emit work_deleted event
    const summary = `Work item "${item.title}" deleted (was ${previousStatus}${wasClaimed ? `, claimed by ${wasClaimed.slice(0, 12)}` : ""})`;
    db.query(
      "INSERT INTO events (timestamp, event_type, actor_id, target_id, target_type, summary) VALUES (?, 'work_deleted', NULL, ?, 'work_item', ?)"
    ).run(now, itemId, summary);
  })();

  return {
    item_id: itemId,
    deleted: true,
    title: item.title,
    previous_status: previousStatus,
    was_claimed_by: wasClaimed,
  };
}

export interface WorkItemWithProject extends BlackboardWorkItem {
  project_name: string | null;
}

export interface ListWorkItemsOptions {
  all?: boolean;
  status?: string;
  priority?: string;
  project?: string;
}

export interface WorkItemDetail {
  item: BlackboardWorkItem;
  history: BlackboardEvent[];
}

/**
 * List work items with optional filters.
 * Default: status='available'. Order: priority ASC (P1 first), created_at DESC.
 */
export function listWorkItems(
  db: Database,
  opts?: ListWorkItemsOptions
): WorkItemWithProject[] {
  const conditions: string[] = [];
  const params: any[] = [];

  if (!opts?.all) {
    if (opts?.status) {
      const statuses = opts.status.split(",").map(s => s.trim());
      for (const s of statuses) {
        if (!WORK_ITEM_STATUSES.includes(s as any)) {
          throw new BlackboardError(
            `Invalid status "${s}". Valid values: ${WORK_ITEM_STATUSES.join(", ")}`,
            "INVALID_STATUS"
          );
        }
      }
      conditions.push(`w.status IN (${statuses.map(() => "?").join(", ")})`);
      params.push(...statuses);
    } else {
      conditions.push("w.status = ?");
      params.push("available");
    }
  } else if (opts?.status) {
    // --all with --status: status filter takes precedence
    const statuses = opts.status.split(",").map(s => s.trim());
    for (const s of statuses) {
      if (!WORK_ITEM_STATUSES.includes(s as any)) {
        throw new BlackboardError(
          `Invalid status "${s}". Valid values: ${WORK_ITEM_STATUSES.join(", ")}`,
          "INVALID_STATUS"
        );
      }
    }
    conditions.push(`w.status IN (${statuses.map(() => "?").join(", ")})`);
    params.push(...statuses);
  }

  if (opts?.priority) {
    const priorities = opts.priority.split(",").map(p => p.trim());
    for (const p of priorities) {
      if (!WORK_ITEM_PRIORITIES.includes(p as any)) {
        throw new BlackboardError(
          `Invalid priority "${p}". Valid values: ${WORK_ITEM_PRIORITIES.join(", ")}`,
          "INVALID_PRIORITY"
        );
      }
    }
    conditions.push(`w.priority IN (${priorities.map(() => "?").join(", ")})`);
    params.push(...priorities);
  }

  if (opts?.project) {
    conditions.push("w.project_id = ?");
    params.push(opts.project);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const sql = `SELECT w.*, p.display_name AS project_name FROM work_items w LEFT JOIN projects p ON w.project_id = p.project_id ${where} ORDER BY w.priority ASC, w.created_at ASC`;

  return db.query(sql).all(...params) as WorkItemWithProject[];
}

/**
 * Get detailed status for a single work item, including event history.
 */
export function getWorkItemStatus(
  db: Database,
  itemId: string
): WorkItemDetail {
  const item = db
    .query("SELECT * FROM work_items WHERE item_id = ?")
    .get(itemId) as BlackboardWorkItem | null;

  if (!item) {
    throw new BlackboardError(
      `Work item not found: ${itemId}`,
      "WORK_ITEM_NOT_FOUND"
    );
  }

  const history = db
    .query(
      "SELECT * FROM events WHERE target_id = ? AND target_type = 'work_item' ORDER BY timestamp ASC"
    )
    .all(itemId) as BlackboardEvent[];

  return { item, history };
}

export interface UpdateWorkItemMetadataResult {
  item_id: string;
  updated: boolean;
  metadata: Record<string, unknown>;
}

/**
 * Merge new keys into a work item's existing metadata JSON.
 * Does not replace the whole object — only updates provided keys.
 * Emits a metadata_updated event.
 */
export function updateWorkItemMetadata(
  db: Database,
  itemId: string,
  metadataUpdates: Record<string, unknown>
): UpdateWorkItemMetadataResult {
  const item = db
    .query("SELECT * FROM work_items WHERE item_id = ?")
    .get(itemId) as BlackboardWorkItem | null;

  if (!item) {
    throw new BlackboardError(`Work item not found: ${itemId}`, "WORK_ITEM_NOT_FOUND");
  }

  // Parse existing metadata or start with empty object
  let existing: Record<string, unknown> = {};
  if (item.metadata) {
    try {
      existing = JSON.parse(item.metadata);
    } catch {
      // If existing metadata is somehow corrupt, start fresh
      existing = {};
    }
  }

  // Merge: new keys override existing
  const merged = { ...existing, ...metadataUpdates };
  const mergedJson = JSON.stringify(merged);

  const now = new Date().toISOString();
  const changedKeys = Object.keys(metadataUpdates);

  db.transaction(() => {
    db.query("UPDATE work_items SET metadata = ? WHERE item_id = ?").run(mergedJson, itemId);

    const summary = `Metadata updated on "${item.title}": ${changedKeys.join(", ")}`;
    db.query(
      "INSERT INTO events (timestamp, event_type, actor_id, target_id, target_type, summary, metadata) VALUES (?, 'metadata_updated', NULL, ?, 'work_item', ?, ?)"
    ).run(now, itemId, summary, JSON.stringify({ keys_updated: changedKeys }));
  })();

  return { item_id: itemId, updated: true, metadata: merged };
}

export interface AppendWorkItemEventOptions {
  event_type: string;
  summary: string;
  actor_id?: string;
  metadata?: Record<string, unknown>;
  source?: string;
}

export interface AppendWorkItemEventResult {
  item_id: string;
  event_id: number;
  event_type: string;
  timestamp: string;
}

/**
 * Record a structured event against a work item.
 * Allows any valid event type to be appended with custom summary and metadata.
 */
export function appendWorkItemEvent(
  db: Database,
  itemId: string,
  opts: AppendWorkItemEventOptions
): AppendWorkItemEventResult {
  const item = db
    .query("SELECT item_id, title FROM work_items WHERE item_id = ?")
    .get(itemId) as { item_id: string; title: string } | null;

  if (!item) {
    throw new BlackboardError(`Work item not found: ${itemId}`, "WORK_ITEM_NOT_FOUND");
  }

  if (!KNOWN_EVENT_TYPES.includes(opts.event_type as KnownEventType)) {
    throw new BlackboardError(
      `Unknown event_type "${opts.event_type}". Known values: ${KNOWN_EVENT_TYPES.join(", ")}`,
      "INVALID_EVENT_TYPE"
    );
  }

  const summary = sanitizeText(opts.summary);
  if (!summary) {
    throw new BlackboardError("Event summary is required", "MISSING_SUMMARY");
  }

  // Content filter: scan event summary if source is external
  if (opts.source && requiresFiltering(opts.source)) {
    ingestExternalContent(summary, opts.source, "mixed");
  }

  let metadataJson: string | null = null;
  if (opts.metadata) {
    metadataJson = JSON.stringify(opts.metadata);
  }

  const now = new Date().toISOString();
  const actorId = opts.actor_id ?? null;

  const result = db.query(
    "INSERT INTO events (timestamp, event_type, actor_id, target_id, target_type, summary, metadata) VALUES (?, ?, ?, ?, 'work_item', ?, ?)"
  ).run(now, opts.event_type, actorId, itemId, summary, metadataJson);

  return {
    item_id: itemId,
    event_id: Number(result.lastInsertRowid),
    event_type: opts.event_type,
    timestamp: now,
  };
}

// ─── F-028: Failure tracking functions ───────────────────────────────────────

/**
 * Mark a work item as failed, increment its failure_count.
 * Auto-quarantines at failure_count >= 3.
 */
export function failWorkItem(db: Database, itemId: string, reason: string): void {
  db.run(
    `UPDATE work_items SET failure_count = failure_count + 1, failed_at = datetime('now'), status = 'failed', failure_reason = ? WHERE item_id = ?`,
    [reason, itemId]
  );
  const item = db.query<{ failure_count: number }>(
    "SELECT failure_count FROM work_items WHERE item_id = ?"
  ).get(itemId);
  if (item && item.failure_count >= 3) {
    quarantineWorkItem(db, itemId, `Failed ${item.failure_count} times: ${reason}`);
  }
}

/**
 * Permanently quarantine a work item (excluded from dispatch).
 */
export function quarantineWorkItem(db: Database, itemId: string, reason: string): void {
  const now = new Date().toISOString();
  db.transaction(() => {
    db.run(
      "UPDATE work_items SET status = 'quarantined', failure_reason = ? WHERE item_id = ?",
      [reason, itemId]
    );
    const summary = `Work item ${itemId} quarantined: ${reason}`;
    db.query(
      "INSERT INTO events (timestamp, event_type, actor_id, target_id, target_type, summary) VALUES (?, 'work_quarantined', NULL, ?, 'work_item', ?)"
    ).run(now, itemId, summary);
  })();
}

/**
 * Return all failed or quarantined work items, newest first.
 */
export function getFailedItems(db: Database): BlackboardWorkItem[] {
  return db.query<BlackboardWorkItem>(
    "SELECT * FROM work_items WHERE status IN ('failed', 'quarantined') ORDER BY failed_at DESC"
  ).all();
}

/**
 * Requeue a failed/quarantined item: reset status to available, clear failure tracking.
 */
export function requeueWorkItem(db: Database, itemId: string): void {
  const now = new Date().toISOString();
  db.transaction(() => {
    db.run(
      "UPDATE work_items SET status = 'available', failure_count = 0, failure_reason = NULL, failed_at = NULL WHERE item_id = ?",
      [itemId]
    );
    const summary = `Work item ${itemId} requeued (failure tracking reset)`;
    db.query(
      "INSERT INTO events (timestamp, event_type, actor_id, target_id, target_type, summary) VALUES (?, 'work_requeued', NULL, ?, 'work_item', ?)"
    ).run(now, itemId, summary);
  })();
}
