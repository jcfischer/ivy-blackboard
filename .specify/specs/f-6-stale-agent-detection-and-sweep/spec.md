---
feature: "Stale agent detection and sweep"
feature_id: "F-6"
status: "approved"
priority: 5
depends_on: ["F-4", "F-9"]
---

# Specification: Stale Agent Detection and Sweep

## Problem

When an agent crashes (kill -9, power loss, OOM), it leaves behind an active session and claimed work items that no other agent can access. Without stale detection, the blackboard accumulates zombie registrations and orphaned claims, degrading coordination quality over time. The architecture spec mandates passive sweep (no daemon) with PID verification.

## Users

- **The blackboard CLI** runs sweep automatically on every invocation
- **Operators** who run `blackboard sweep` manually for immediate cleanup
- **Other agents** that observe `agent_stale` and `stale_locks_released` events to pick up dropped work

## Functional Requirements

### FR-1: sweepStaleAgents(db, config?)

The core sweep function that detects and handles stale agents.

**Step 1 — Find candidates:**
Query agents WHERE status IN ('active', 'idle') AND last_seen_at < (now - staleThreshold).
Default staleThreshold: 300 seconds (5 minutes), configurable via config.json `staleThresholdSeconds`.

**Step 2 — PID verification:**
For each candidate, check if the PID is alive using `process.kill(pid, 0)`.
- If PID is alive: the agent missed heartbeats but is still running. Update last_seen_at to now (benefit of the doubt). Do NOT mark stale.
- If PID is null or dead: proceed to mark stale.

**Step 3 — Mark stale (atomic transaction per agent):**
- Set agent status='stale'
- Release all work items claimed by this agent: set status='available', claimed_by=NULL, claimed_at=NULL (uses releaseWorkItem logic from F-9, or direct SQL for the sweep case where we don't need session validation)
- Emit `agent_stale` event with summary including agent name, last_seen_at, and PID
- If work items were released, emit `stale_locks_released` event listing released item titles

**Step 4 — Prune old heartbeats:**
Delete heartbeat records older than pruneAfterDays (default 7 days, configurable).

**Returns:**
```typescript
interface SweepResult {
  staleAgents: Array<{ sessionId: string; agentName: string; releasedItems: string[] }>;
  pidsVerified: string[];  // agents that were alive despite old last_seen_at
  heartbeatsPruned: number;
}
```

### FR-2: isPidAlive(pid)

Utility function to check process liveness.

- If pid is null: return false
- Try `process.kill(pid, 0)` — returns true if process exists
- Catch error: return false (process doesn't exist)
- This is a read-only check; signal 0 doesn't actually send a signal

### FR-3: Automatic sweep on CLI invocation

Every CLI command runs a lightweight sweep before executing. This is the "passive detection" model — no daemon needed.

- Runs after database open, before command execution
- Uses default config unless overridden by config.json
- Silent unless stale agents are found (no output on clean sweep)
- Errors in sweep do not prevent the main command from executing (fail-open)

### FR-4: CLI `blackboard sweep` command

Manual sweep with explicit output.

```bash
blackboard sweep
```

Human-readable output:
```
Stale detection sweep:
  Marked stale: 1 agent (session abc-1234, PID 12345 not found)
  Released: 2 work items from stale agents
  Pruned: 847 heartbeat records older than 7 days
```

If no stale agents: "No stale agents detected."

JSON: formatJson(sweepResult)

Options:
- `--dry-run`: Report what would happen without making changes
- `--threshold <seconds>`: Override stale threshold for this run

### FR-5: Configuration

Stale detection reads from config.json (F-20) with these fields:

| Field | Default | Source |
|-------|---------|--------|
| staleThresholdSeconds | 300 | config.json or `BLACKBOARD_STALE_THRESHOLD` env |
| pruneHeartbeatsAfterDays | 7 | config.json |

## Error Handling

| Scenario | Behavior |
|----------|----------|
| PID check fails (permission error) | Treat as alive (fail-safe, don't mark stale) |
| Sweep transaction fails mid-agent | Transaction rolls back for that agent, continue with next |
| Config value invalid | Use default, log warning |
| Database locked during sweep | Respect busy_timeout (5s), then skip sweep silently |

## Edge Cases

- **PID reuse**: OS may assign a dead agent's PID to a new process. The sweep would see the PID as alive and skip marking stale. This is acceptable — the next sweep after the new process exits will catch it. Session UUID remains the primary identity.
- **Clock skew**: If system clock jumps backward, more agents may appear stale. PID verification prevents false positives.
- **Agent with no PID**: Agents registered via library calls (not CLI) may have pid=null. These are marked stale based on last_seen_at alone.
- **Concurrent sweeps**: Two CLI commands running simultaneously may both attempt to sweep. SQLite transactions ensure each agent is only marked stale once (the second UPDATE affects 0 rows).

## Non-Functional Requirements

- Sweep runs in < 100ms for up to 100 candidate agents
- PID checks are O(1) per agent (single syscall)
- Heartbeat pruning uses indexed timestamp column
- Automatic sweep does not add perceptible latency to commands

## Success Criteria

- [ ] Agents with expired last_seen_at and dead PID are marked stale
- [ ] Agents with expired last_seen_at but alive PID get refreshed
- [ ] Claimed work items from stale agents are released to available
- [ ] agent_stale and stale_locks_released events are emitted
- [ ] Old heartbeat records are pruned
- [ ] CLI sweep shows results in human and JSON format
- [ ] Dry-run mode reports without making changes
- [ ] All existing 163 tests continue to pass
