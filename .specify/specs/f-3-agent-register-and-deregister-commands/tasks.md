---
feature: "Agent register and deregister commands"
plan: "./plan.md"
status: "pending"
total_tasks: 5
completed: 0
---

# Tasks: Agent Register and Deregister Commands

## Legend

- `[T]` - Test required (TDD mandatory - write test FIRST)
- `[P]` - Can run in parallel with other [P] tasks in same group
- `depends: T-X.Y` - Must complete after specified task(s)

## Task Groups

### Group 1: Core register function

- [ ] **T-1.1** Implement registerAgent core function [T]
  - File: `src/agent.ts` (new)
  - Test: `tests/agent.test.ts` (new)
  - Description: Create `registerAgent(db, opts)` that generates UUID v4 via `crypto.randomUUID()`, captures `process.pid`, inserts into agents table with status='active' and started_at/last_seen_at set to current ISO 8601. Emits `agent_registered` event with agent name and project in summary. All in one `db.transaction()`. Returns `RegisterAgentResult` with session_id, agent_name, pid, parent_id, project, current_work, status, started_at.

- [ ] **T-1.2** Implement delegate registration [T] (depends: T-1.1)
  - File: `src/agent.ts`
  - Test: `tests/agent.test.ts`
  - Description: When `opts.parentId` is provided, set `parent_id` on the new agent row. FK constraint validates parent exists. Event summary includes "delegate" designation. Test: register parent, register delegate with --parent, verify parent_id set and FK violation on invalid parent.

### Group 2: Core deregister function

- [ ] **T-2.1** Implement deregisterAgent core function [T] (depends: T-1.1)
  - File: `src/agent.ts`
  - Test: `tests/agent.test.ts`
  - Description: Create `deregisterAgent(db, sessionId)` that validates session exists (throw BlackboardError if not), updates status to 'completed', releases claimed work items (UPDATE work_items SET status='available', claimed_by=NULL WHERE claimed_by=sessionId AND status='claimed'), emits `agent_deregistered` event, calculates duration from started_at. All in one transaction. Returns `DeregisterAgentResult` with session_id, agent_name, released_count, duration_seconds. Idempotent: deregistering completed agent is a no-op returning existing state.

### Group 3: Wire CLI commands

- [ ] **T-3.1** Wire register CLI command [T] (depends: T-1.1, T-1.2)
  - File: `src/commands/agent.ts` (modify)
  - Test: `tests/agent.test.ts`
  - Description: Replace register stub action. Parse --name (required), --project, --work, --parent options. Call `registerAgent(ctx.db, opts)`. Human output: show session_id, name, project, PID, started_at. JSON output: `formatJson(result)`. Error handling via `withErrorHandling`.

- [ ] **T-3.2** Wire deregister CLI command [T] (depends: T-2.1)
  - File: `src/commands/agent.ts` (modify)
  - Test: `tests/agent.test.ts`
  - Description: Replace deregister stub action. Parse --session (required). Call `deregisterAgent(ctx.db, sessionId)`. Human output: show deregistered message, released count, duration. JSON output: `formatJson(result)`.

## Dependency Graph

```
T-1.1 ──┬──> T-1.2 ──> T-3.1
         │
         └──> T-2.1 ──> T-3.2
```

## Execution Order

1. **T-1.1** Core registerAgent
2. **Parallel:** T-1.2, T-2.1 (after T-1.1)
3. **Parallel:** T-3.1, T-3.2 (after respective deps)

## Progress Tracking

| Task | Status | Started | Completed | Notes |
|------|--------|---------|-----------|-------|
| T-1.1 | pending | - | - | |
| T-1.2 | pending | - | - | |
| T-2.1 | pending | - | - | |
| T-3.1 | pending | - | - | |
| T-3.2 | pending | - | - | |

## TDD Enforcement (MANDATORY)

**CRITICAL:** Every task marked [T] MUST follow the RED-GREEN-BLUE cycle.

### Test Notes

Tests use in-memory or temp databases with full schema initialized via openDatabase. Each test registers agents for setup. Tests verify both the DB state (query after operation) and the return value.
