---
feature: "Stale agent detection and sweep"
plan: "./plan.md"
status: "pending"
total_tasks: 5
completed: 0
---

# Tasks: Stale Agent Detection and Sweep

## Legend

- `[T]` - Test required (TDD mandatory - write test FIRST)
- `depends: T-X.Y` - Must complete after specified task(s)

## Task Groups

### Group 1: Core utilities

- [ ] **T-1.1** Implement isPidAlive utility [T]
  - File: `src/sweep.ts` (new)
  - Test: `tests/sweep.test.ts` (new)
  - Description: Create `isPidAlive(pid: number | null): boolean`. If pid is null, return false. Try process.kill(pid, 0). Return true on success. Catch ESRCH → false (process dead). Catch EPERM → true (process exists but we lack permission — fail-safe). Export from sweep.ts.

### Group 2: Core sweep

- [ ] **T-2.1** Implement sweepStaleAgents core function [T] (depends: T-1.1)
  - File: `src/sweep.ts`
  - Test: `tests/sweep.test.ts`
  - Description: Create `sweepStaleAgents(db, config?)`. Default config from loadConfig(). Query candidates: agents WHERE status IN ('active','idle') AND last_seen_at < (now - staleThresholdSeconds). For each: if isPidAlive(pid), update last_seen_at and add to pidsVerified. If dead: atomic transaction — mark stale, release claimed work items (SET status='available', claimed_by=NULL, claimed_at=NULL), emit agent_stale event, emit stale_locks_released event if items released. Prune heartbeats older than pruneHeartbeatsAfterDays. Return SweepResult.

- [ ] **T-2.2** Handle edge cases in sweep [T] (depends: T-2.1)
  - File: `src/sweep.ts`
  - Test: `tests/sweep.test.ts`
  - Description: Agent with pid=null treated as dead. Agent with alive PID gets last_seen_at refreshed. Concurrent sweep safety (second UPDATE affects 0 rows). Sweep with no candidates returns empty result. Transaction failure on one agent doesn't prevent processing others.

### Group 3: Integration

- [ ] **T-3.1** Add auto-sweep to createContext [T] (depends: T-2.1)
  - File: `src/context.ts` (modify)
  - Test: `tests/sweep.test.ts`
  - Description: After openDatabase in createContext(), call sweepStaleAgents(db) wrapped in try/catch. Sweep errors are silently swallowed (fail-open). No console output from auto-sweep. Import loadConfig to get stale threshold.

- [ ] **T-3.2** Wire CLI sweep command [T] (depends: T-2.1)
  - File: `src/commands/sweep.ts` (modify)
  - Test: `tests/sweep.test.ts`
  - Description: Replace stub. Options: --dry-run (report without modifying), --threshold <seconds> (override staleThresholdSeconds). Call sweepStaleAgents. Human output: "Stale detection sweep:\n  Marked stale: N agent(s)...\n  Released: N work items...\n  Pruned: N heartbeat records". If no stale agents: "No stale agents detected." JSON: formatJson(sweepResult). Dry-run: query candidates but skip transactions, append "(dry run)" to output.

## Dependency Graph

```
T-1.1 ──> T-2.1 ──┬──> T-2.2
                   ├──> T-3.1
                   └──> T-3.2
```

## Execution Order

1. **T-1.1** isPidAlive
2. **T-2.1** sweepStaleAgents core
3. **Parallel:** T-2.2, T-3.1, T-3.2 (after T-2.1)

## Progress Tracking

| Task | Status | Started | Completed | Notes |
|------|--------|---------|-----------|-------|
| T-1.1 | pending | - | - | |
| T-2.1 | pending | - | - | |
| T-2.2 | pending | - | - | |
| T-3.1 | pending | - | - | |
| T-3.2 | pending | - | - | |

## TDD Enforcement (MANDATORY)

### Test Notes

Tests use agents registered with pid=null (always dead for sweep) or pid=process.pid (always alive). Set last_seen_at to old timestamps via direct SQL to trigger stale detection. Insert old heartbeat records to test pruning. For auto-sweep tests, create context with stale agents already in DB and verify they get cleaned up.
