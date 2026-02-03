---
feature: "Stale agent detection and sweep"
---

# Stale Agent Detection and Sweep

## Overview

Passive detection of stale agents via PID liveness checking. Runs automatically on every CLI invocation. Releases work items claimed by dead agents.

## API

### isPidAlive(pid: number | null): boolean

Checks if a process is alive. Uses `process.kill(pid, 0)` (signal 0 = existence check). Returns `false` for null PIDs. Treats EPERM as alive (fail-safe).

### sweepStaleAgents(db, config?): SweepResult

Detects and handles stale agents:

1. Queries agents with status `active`/`idle` and `last_seen_at` older than threshold
2. For each candidate:
   - If PID alive: refreshes `last_seen_at`
   - If PID dead: marks `stale`, releases claimed work items, emits events
3. Prunes old heartbeat records

**Config options:**
- `staleThresholdSeconds` (default: 300 from config)
- `pruneHeartbeatsAfterDays` (default: 7 from config)

### sweepDryRun(db, config?): { candidates }

Non-destructive version that reports what would be swept without modifying state.

### disableAutoSweep(): void

Prevents auto-sweep during the current process. Used by the sweep command to handle its own sweep.

## CLI Command

```bash
blackboard sweep [--dry-run] [--threshold <seconds>] [--json]
```

**Options:**
- `--dry-run` — Report candidates without modifying state
- `--threshold <seconds>` — Override stale threshold from config

**Output:**
```
Stale detection sweep:
  Marked stale: 1 agent(s)
  Released: 2 work item(s)
  Pruned: 15 heartbeat record(s)
```

## Auto-sweep

Every CLI invocation runs `sweepStaleAgents` silently in `createContext()`. Wrapped in try/catch — sweep failure never prevents command execution. The `sweep` command itself opts out of auto-sweep to avoid double-sweeping.

## Events Emitted

| Event | When |
|-------|------|
| `agent_stale` | Agent marked stale |
| `stale_locks_released` | Work items released from stale agent |
