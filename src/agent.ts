import type { Database } from "bun:sqlite";
import { BlackboardError } from "./errors";

export interface RegisterAgentOptions {
  name: string;
  project?: string;
  work?: string;
  parentId?: string;
}

export interface RegisterAgentResult {
  session_id: string;
  agent_name: string;
  pid: number;
  parent_id: string | null;
  project: string | null;
  current_work: string | null;
  status: "active";
  started_at: string;
}

export interface DeregisterAgentResult {
  session_id: string;
  agent_name: string;
  released_count: number;
  duration_seconds: number;
}

/**
 * Register a new agent session.
 * Inserts agent row and emits agent_registered event in one transaction.
 */
export function registerAgent(
  db: Database,
  opts: RegisterAgentOptions
): RegisterAgentResult {
  const sessionId = crypto.randomUUID();
  const now = new Date().toISOString();
  const pid = process.pid;
  const parentId = opts.parentId ?? null;
  const project = opts.project ?? null;
  const work = opts.work ?? null;

  const isDelegate = parentId !== null;
  const designation = isDelegate ? "Delegate agent" : "Agent";
  const summary = `${designation} "${opts.name}" registered on project "${project ?? "none"}"`;

  db.transaction(() => {
    db.query(`
      INSERT INTO agents (session_id, agent_name, pid, parent_id, project, current_work, status, started_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `).run(sessionId, opts.name, pid, parentId, project, work, now, now);

    db.query(`
      INSERT INTO events (timestamp, event_type, actor_id, target_id, target_type, summary)
      VALUES (?, 'agent_registered', ?, ?, 'agent', ?)
    `).run(now, sessionId, sessionId, summary);
  })();

  return {
    session_id: sessionId,
    agent_name: opts.name,
    pid,
    parent_id: parentId,
    project,
    current_work: work,
    status: "active",
    started_at: now,
  };
}

/**
 * Deregister an agent session.
 * Sets status to completed, releases claimed work items, emits event.
 * Idempotent: deregistering a completed agent is a no-op.
 */
export function deregisterAgent(
  db: Database,
  sessionId: string
): DeregisterAgentResult {
  const agent = db
    .query("SELECT session_id, agent_name, started_at, status FROM agents WHERE session_id = ?")
    .get(sessionId) as { session_id: string; agent_name: string; started_at: string; status: string } | null;

  if (!agent) {
    throw new BlackboardError(
      `Agent session not found: ${sessionId}`,
      "AGENT_NOT_FOUND"
    );
  }

  const now = new Date().toISOString();
  const durationMs = new Date(now).getTime() - new Date(agent.started_at).getTime();
  const durationSeconds = Math.round(durationMs / 1000);

  let releasedCount = 0;

  if (agent.status !== "completed") {
    db.transaction(() => {
      // Release claimed work items
      const releaseResult = db.query(`
        UPDATE work_items SET status = 'available', claimed_by = NULL, claimed_at = NULL
        WHERE claimed_by = ? AND status = 'claimed'
      `).run(sessionId);
      releasedCount = releaseResult.changes;

      // Update agent status
      db.query("UPDATE agents SET status = 'completed', last_seen_at = ? WHERE session_id = ?").run(
        now,
        sessionId
      );

      // Emit event
      const summary = `Agent "${agent.agent_name}" deregistered after ${durationSeconds}s, released ${releasedCount} work item(s)`;
      db.query(`
        INSERT INTO events (timestamp, event_type, actor_id, target_id, target_type, summary)
        VALUES (?, 'agent_deregistered', ?, ?, 'agent', ?)
      `).run(now, sessionId, sessionId, summary);
    })();
  }

  return {
    session_id: sessionId,
    agent_name: agent.agent_name,
    released_count: releasedCount,
    duration_seconds: durationSeconds,
  };
}
