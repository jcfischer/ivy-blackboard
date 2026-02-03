import type { Database } from "bun:sqlite";
import { BlackboardError } from "./errors";
import { WORK_ITEM_SOURCES, WORK_ITEM_PRIORITIES } from "./types";

export interface CreateWorkItemOptions {
  id: string;
  title: string;
  description?: string;
  project?: string | null;
  source?: string;
  sourceRef?: string;
  priority?: string;
  metadata?: string;
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

/**
 * Create a new work item.
 * Validates source/priority, inserts row, emits work_created event.
 */
export function createWorkItem(
  db: Database,
  opts: CreateWorkItemOptions
): CreateWorkItemResult {
  const now = new Date().toISOString();
  const source = opts.source ?? "local";
  const priority = opts.priority ?? "P2";
  const description = opts.description ?? null;
  const project = opts.project ?? null;
  const sourceRef = opts.sourceRef ?? null;
  let metadata: string | null = null;

  if (!WORK_ITEM_SOURCES.includes(source as any)) {
    throw new BlackboardError(
      `Invalid source "${source}". Valid values: ${WORK_ITEM_SOURCES.join(", ")}`,
      "INVALID_SOURCE"
    );
  }

  if (!WORK_ITEM_PRIORITIES.includes(priority as any)) {
    throw new BlackboardError(
      `Invalid priority "${priority}". Valid values: ${WORK_ITEM_PRIORITIES.join(", ")}`,
      "INVALID_PRIORITY"
    );
  }

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
        INSERT INTO work_items (item_id, project_id, title, description, source, source_ref, status, priority, created_at, metadata)
        VALUES (?, ?, ?, ?, ?, ?, 'available', ?, ?, ?)
      `).run(opts.id, project, opts.title, description, source, sourceRef, priority, now, metadata);

      const summary = `Work item "${opts.title}" created as ${opts.id}`;
      db.query(`
        INSERT INTO events (timestamp, event_type, actor_id, target_id, target_type, summary)
        VALUES (?, 'work_created', NULL, ?, 'work_item', ?)
      `).run(now, opts.id, summary);
    })();
  } catch (err: any) {
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
    title: opts.title,
    status: "available",
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
  const source = opts.source ?? "local";
  const priority = opts.priority ?? "P2";
  const description = opts.description ?? null;
  const project = opts.project ?? null;
  const sourceRef = opts.sourceRef ?? null;
  let metadata: string | null = null;

  if (!WORK_ITEM_SOURCES.includes(source as any)) {
    throw new BlackboardError(
      `Invalid source "${source}". Valid values: ${WORK_ITEM_SOURCES.join(", ")}`,
      "INVALID_SOURCE"
    );
  }

  if (!WORK_ITEM_PRIORITIES.includes(priority as any)) {
    throw new BlackboardError(
      `Invalid priority "${priority}". Valid values: ${WORK_ITEM_PRIORITIES.join(", ")}`,
      "INVALID_PRIORITY"
    );
  }

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

  db.transaction(() => {
    db.query(`
      INSERT INTO work_items (item_id, project_id, title, description, source, source_ref, status, priority, claimed_by, claimed_at, created_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, 'claimed', ?, ?, ?, ?, ?)
    `).run(opts.id, project, opts.title, description, source, sourceRef, priority, sessionId, now, now, metadata);

    const createSummary = `Work item "${opts.title}" created as ${opts.id}`;
    db.query(`
      INSERT INTO events (timestamp, event_type, actor_id, target_id, target_type, summary)
      VALUES (?, 'work_created', ?, ?, 'work_item', ?)
    `).run(now, sessionId, opts.id, createSummary);

    const claimSummary = `Work item "${opts.title}" claimed by agent ${sessionId.slice(0, 12)}`;
    db.query(`
      INSERT INTO events (timestamp, event_type, actor_id, target_id, target_type, summary)
      VALUES (?, 'work_claimed', ?, ?, 'work_item', ?)
    `).run(now, sessionId, opts.id, claimSummary);
  })();

  return {
    item_id: opts.id,
    title: opts.title,
    status: "claimed",
    claimed_by: sessionId,
    claimed_at: now,
    created_at: now,
  };
}
