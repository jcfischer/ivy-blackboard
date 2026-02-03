import type { Database } from "bun:sqlite";
import { loadConfig } from "./config";
import type { BlackboardAgent } from "./types";

export interface SweepConfig {
  staleThresholdSeconds?: number;
  pruneHeartbeatsAfterDays?: number;
}

export interface SweepResult {
  staleAgents: Array<{
    sessionId: string;
    agentName: string;
    releasedItems: string[];
  }>;
  pidsVerified: string[];
  heartbeatsPruned: number;
}

/**
 * Check if a process is alive by PID.
 * Returns false for null. EPERM means process exists (fail-safe: treat as alive).
 */
export function isPidAlive(pid: number | null): boolean {
  if (pid === null) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: any) {
    if (err.code === "EPERM") return true; // exists but no permission
    return false; // ESRCH — process doesn't exist
  }
}

/**
 * Detect and mark stale agents, release their claimed work items, prune old heartbeats.
 */
export function sweepStaleAgents(
  db: Database,
  config?: SweepConfig
): SweepResult {
  const defaults = loadConfig();
  const staleThresholdSeconds = config?.staleThresholdSeconds ?? defaults.heartbeat.staleThresholdSeconds;
  const pruneHeartbeatsAfterDays = config?.pruneHeartbeatsAfterDays ?? defaults.sweep.pruneHeartbeatsAfterDays;

  const threshold = new Date(Date.now() - staleThresholdSeconds * 1000).toISOString();

  // Query candidates: active/idle agents with old last_seen_at
  const candidates = db.query(
    "SELECT * FROM agents WHERE status IN ('active', 'idle') AND last_seen_at < ?"
  ).all(threshold) as BlackboardAgent[];

  const result: SweepResult = {
    staleAgents: [],
    pidsVerified: [],
    heartbeatsPruned: 0,
  };

  const now = new Date().toISOString();

  for (const agent of candidates) {
    if (isPidAlive(agent.pid)) {
      // Process still alive — refresh last_seen_at
      db.query("UPDATE agents SET last_seen_at = ? WHERE session_id = ?")
        .run(now, agent.session_id);
      result.pidsVerified.push(agent.session_id);
    } else {
      // Process dead — mark stale and release work items
      const releasedItems: string[] = [];

      db.transaction(() => {
        db.query("UPDATE agents SET status = 'stale' WHERE session_id = ?")
          .run(agent.session_id);

        const released = db.query(
          "UPDATE work_items SET status = 'available', claimed_by = NULL, claimed_at = NULL WHERE claimed_by = ? AND status = 'claimed' RETURNING item_id"
        ).all(agent.session_id) as Array<{ item_id: string }>;

        for (const item of released) {
          releasedItems.push(item.item_id);
        }

        // Emit agent_stale event
        const staleSummary = `Agent "${agent.agent_name}" (${agent.session_id.slice(0, 12)}) marked stale`;
        db.query(
          "INSERT INTO events (timestamp, event_type, actor_id, target_id, target_type, summary) VALUES (?, 'agent_stale', NULL, ?, 'agent', ?)"
        ).run(now, agent.session_id, staleSummary);

        // Emit stale_locks_released if items were released
        if (releasedItems.length > 0) {
          const lockSummary = `Released ${releasedItems.length} work item(s) from stale agent "${agent.agent_name}"`;
          db.query(
            "INSERT INTO events (timestamp, event_type, actor_id, target_id, target_type, summary) VALUES (?, 'stale_locks_released', NULL, ?, 'agent', ?)"
          ).run(now, agent.session_id, lockSummary);
        }
      })();

      result.staleAgents.push({
        sessionId: agent.session_id,
        agentName: agent.agent_name,
        releasedItems,
      });
    }
  }

  // Prune old heartbeats
  const pruneThreshold = new Date(
    Date.now() - pruneHeartbeatsAfterDays * 24 * 60 * 60 * 1000
  ).toISOString();

  const pruneResult = db.query(
    "DELETE FROM heartbeats WHERE timestamp < ?"
  ).run(pruneThreshold);

  result.heartbeatsPruned = pruneResult.changes;

  return result;
}

/**
 * Dry-run sweep: query candidates without modifying state.
 */
export function sweepDryRun(
  db: Database,
  config?: SweepConfig
): { candidates: Array<{ sessionId: string; agentName: string; pid: number | null; lastSeenAt: string; pidAlive: boolean }> } {
  const defaults = loadConfig();
  const staleThresholdSeconds = config?.staleThresholdSeconds ?? defaults.heartbeat.staleThresholdSeconds;

  const threshold = new Date(Date.now() - staleThresholdSeconds * 1000).toISOString();

  const candidates = db.query(
    "SELECT * FROM agents WHERE status IN ('active', 'idle') AND last_seen_at < ?"
  ).all(threshold) as BlackboardAgent[];

  return {
    candidates: candidates.map(a => ({
      sessionId: a.session_id,
      agentName: a.agent_name,
      pid: a.pid,
      lastSeenAt: a.last_seen_at,
      pidAlive: isPidAlive(a.pid),
    })),
  };
}
