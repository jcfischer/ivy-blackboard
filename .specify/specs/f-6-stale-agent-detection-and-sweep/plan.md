---
feature: "Stale agent detection and sweep"
spec: "./spec.md"
status: "draft"
---

# Technical Plan: Stale Agent Detection and Sweep

## Architecture Overview

Create a new `src/sweep.ts` module with `sweepStaleAgents` and `isPidAlive` functions. Wire the `blackboard sweep` CLI command. Add automatic sweep to `createContext()` so every CLI invocation runs a lightweight sweep.

```
CLI invocation
    |
    v
createContext() → auto-sweep (silent, fail-open)
    |
    v
sweepStaleAgents(db, config)
    |
    ├─ Query candidates (last_seen_at < threshold, status active/idle)
    ├─ isPidAlive(pid) for each candidate
    ├─ Mark stale + release work items (atomic per agent)
    └─ Prune old heartbeats
    |
    v
SweepResult { staleAgents, pidsVerified, heartbeatsPruned }
```

## Constitutional Compliance

- [x] **CLI-First:** sweep command already stubbed
- [x] **Library-First:** Core logic in sweep.ts, CLI and context.ts are thin wrappers
- [x] **Test-First:** TDD for sweep, PID check, auto-sweep, prune
- [x] **Deterministic:** Given same DB state and PID liveness, same result
- [x] **No daemon:** Passive detection via CLI invocation, per architecture spec

## Data Model

Reads/writes existing `agents`, `work_items`, `heartbeats`, and `events` tables. No schema changes.

### Sweep configuration (from config.ts — already defined)

```typescript
// Already exists in BlackboardConfigSchema:
heartbeat: {
  staleThresholdSeconds: 300    // 5 minutes
}
sweep: {
  pruneHeartbeatsAfterDays: 7
}
```

### Sweep result

```typescript
interface SweepResult {
  staleAgents: Array<{
    sessionId: string;
    agentName: string;
    releasedItems: string[];
  }>;
  pidsVerified: string[];
  heartbeatsPruned: number;
}
```

## API Contracts

```typescript
function sweepStaleAgents(db: Database, config?: { staleThresholdSeconds?: number; pruneHeartbeatsAfterDays?: number }): SweepResult;
function isPidAlive(pid: number | null): boolean;
```

## Implementation Strategy

### Phase 1: isPidAlive utility
- If pid is null, return false
- Try process.kill(pid, 0) — signal 0 checks existence without killing
- Return true on success, false on ESRCH/EPERM
- Note: EPERM means process exists but we can't signal it — treat as alive (fail-safe)

### Phase 2: sweepStaleAgents core function
- Load config defaults (staleThresholdSeconds=300, pruneHeartbeatsAfterDays=7)
- Calculate threshold timestamp: new Date(Date.now() - staleThresholdSeconds * 1000)
- Query candidates: SELECT FROM agents WHERE status IN ('active', 'idle') AND last_seen_at < threshold
- For each candidate:
  - If isPidAlive(pid): update last_seen_at to now, add to pidsVerified
  - If dead: run atomic transaction:
    - UPDATE agents SET status='stale' WHERE session_id=?
    - UPDATE work_items SET status='available', claimed_by=NULL, claimed_at=NULL WHERE claimed_by=? AND status='claimed' RETURNING item_id, title
    - INSERT event 'agent_stale'
    - INSERT event 'stale_locks_released' (if items released)
- Prune heartbeats: DELETE FROM heartbeats WHERE timestamp < (now - pruneAfterDays)
- Return SweepResult

### Phase 3: Auto-sweep in createContext
- After opening database in createContext(), call sweepStaleAgents silently
- Wrap in try/catch — sweep failure must not prevent command execution
- No output from auto-sweep (callers use the explicit sweep command for visibility)

### Phase 4: Wire CLI sweep command
- Replace stub in commands/sweep.ts
- Options: --dry-run, --threshold <seconds>
- Call sweepStaleAgents with optional threshold override
- Human output: list stale agents, released items, pruned count
- JSON: formatJson(sweepResult)
- If --dry-run: query candidates but don't modify, report what would happen

## File Structure

```
src/
├── sweep.ts            # [New] sweepStaleAgents, isPidAlive
├── context.ts          # [Modify] Add auto-sweep after db open
├── commands/sweep.ts   # [Modify] Replace stub with wired command

tests/
├── sweep.test.ts       # [New] Core logic + auto-sweep + CLI E2E
```

## Testing Strategy

PID checking requires mocking. Tests will:
- Create agents with old last_seen_at timestamps via direct SQL (bypass heartbeat)
- Mock `process.kill` behavior by registering agents with pid=null (always dead) or pid=process.pid (always alive)
- Verify work items are released when agent goes stale
- Verify events are emitted correctly
- Verify heartbeat pruning with old timestamp records
- Verify auto-sweep runs without breaking command execution
- Verify --dry-run does not modify state

## Dependencies

### Internal
- F-1: Schema (agents, work_items, heartbeats, events tables)
- F-4: Heartbeat (last_seen_at is set by heartbeats)
- F-9: Work release (sweep releases claimed items; uses direct SQL rather than releaseWorkItem to avoid session validation)
- F-20: Config (staleThresholdSeconds, pruneHeartbeatsAfterDays)

## Estimated Complexity

- **New files:** 1 (sweep.ts)
- **Modified files:** 2 (context.ts, commands/sweep.ts)
- **Test files:** 1 (new)
- **Estimated tasks:** 5
