---
feature: "Agent heartbeat command"
plan: "./plan.md"
status: "pending"
total_tasks: 3
completed: 0
---

# Tasks: Agent Heartbeat Command

## Legend

- `[T]` - Test required (TDD mandatory - write test FIRST)
- `depends: T-X.Y` - Must complete after specified task(s)

## Task Groups

### Group 1: Core heartbeat function

- [ ] **T-1.1** Implement sendHeartbeat core function [T]
  - File: `src/agent.ts` (modify — created by F-3)
  - Test: `tests/agent.test.ts` (modify)
  - Description: Create `sendHeartbeat(db, opts: HeartbeatOptions)` that validates session exists (throw BlackboardError if not), updates agent.last_seen_at to now, inserts heartbeats row with session_id, timestamp, progress, work_item_id. If progress is provided, also updates agent.current_work and emits `heartbeat` event with progress in summary. No event if progress is null. All in one transaction. Returns `HeartbeatResult` with session_id, agent_name, timestamp, progress.

- [ ] **T-1.2** Handle edge cases [T] (depends: T-1.1)
  - File: `src/agent.ts`
  - Test: `tests/agent.test.ts`
  - Description: Test and handle: heartbeat for non-existent session (clear error with session_id in message), heartbeat with work_item_id that doesn't exist (FK error), heartbeat for completed/stale agent (still works — updates last_seen_at). Verify no event emitted for progress-less heartbeats.

### Group 2: Wire CLI command

- [ ] **T-2.1** Wire heartbeat CLI command [T] (depends: T-1.1)
  - File: `src/commands/agent.ts` (modify)
  - Test: `tests/agent.test.ts`
  - Description: Replace heartbeat stub action. Parse --session (required), --progress, --work-item options. Call `sendHeartbeat(ctx.db, opts)`. Human output: show agent name, timestamp, progress if provided. JSON output: `formatJson(result)`.

## Dependency Graph

```
T-1.1 ──┬──> T-1.2
         └──> T-2.1
```

## Execution Order

1. **T-1.1** Core sendHeartbeat
2. **Parallel:** T-1.2, T-2.1 (after T-1.1)

## Progress Tracking

| Task | Status | Started | Completed | Notes |
|------|--------|---------|-----------|-------|
| T-1.1 | pending | - | - | |
| T-1.2 | pending | - | - | |
| T-2.1 | pending | - | - | |

## TDD Enforcement (MANDATORY)

### Test Notes

Tests require a registered agent (use `registerAgent` from F-3). Verify heartbeats table row, agent.last_seen_at update, and event presence/absence based on progress.
