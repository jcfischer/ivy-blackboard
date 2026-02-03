---
feature: "Agent list command"
plan: "./plan.md"
status: "pending"
total_tasks: 4
completed: 0
---

# Tasks: Agent List Command

## Legend

- `[T]` - Test required (TDD mandatory - write test FIRST)
- `[P]` - Can run in parallel with other [P] tasks in same group
- `depends: T-X.Y` - Must complete after specified task(s)

## Task Groups

### Group 1: Utilities

- [ ] **T-1.1** Implement formatRelativeTime utility [T] [P]
  - File: `src/output.ts` (modify)
  - Test: `tests/output.test.ts` (modify)
  - Description: Add `formatRelativeTime(isoString: string): string` to output.ts. Returns: "just now" (<60s), "Xm ago" (1-59 min), "Xh ago" (1-23 hours), "Xd ago" (1+ days). Uses Date.now() minus parsed ISO timestamp. Export for use in agent list and other commands.

### Group 2: Core list function

- [ ] **T-2.1** Implement listAgents core function [T] (depends: T-1.1)
  - File: `src/agent.ts` (modify — created by F-3)
  - Test: `tests/agent.test.ts` (modify)
  - Description: Create `listAgents(db, opts?: ListAgentsOptions): BlackboardAgent[]`. Default: query WHERE status IN ('active', 'idle'). With `opts.all`: no status filter. With `opts.status`: parse comma-separated string, validate each against AGENT_STATUSES from types.ts, query WHERE status IN (...). Order by last_seen_at DESC. Return array of BlackboardAgent objects.

- [ ] **T-2.2** Handle status validation [T] (depends: T-2.1)
  - File: `src/agent.ts`
  - Test: `tests/agent.test.ts`
  - Description: Validate --status values against allowed statuses. Invalid status throws BlackboardError with the invalid value and list of valid values. Empty result returns empty array (not an error).

### Group 3: Wire CLI command

- [ ] **T-3.1** Wire list CLI command [T] (depends: T-2.1, T-1.1)
  - File: `src/commands/agent.ts` (modify)
  - Test: `tests/agent.test.ts`
  - Description: Replace list stub action. Parse --all, --status options. Call `listAgents(ctx.db, opts)`. Human output: formatTable with columns SESSION (first 12 chars), NAME, PROJECT, STATUS, LAST SEEN (formatRelativeTime), PID. Empty: "No active agents." JSON output: `formatJson({ count, items })`.

## Dependency Graph

```
T-1.1 ──┬──> T-2.1 ──> T-2.2
         │         │
         └─────────└──> T-3.1
```

## Execution Order

1. **T-1.1** formatRelativeTime
2. **T-2.1** Core listAgents
3. **Parallel:** T-2.2, T-3.1 (after T-2.1)

## Progress Tracking

| Task | Status | Started | Completed | Notes |
|------|--------|---------|-----------|-------|
| T-1.1 | pending | - | - | |
| T-2.1 | pending | - | - | |
| T-2.2 | pending | - | - | |
| T-3.1 | pending | - | - | |

## TDD Enforcement (MANDATORY)

### Test Notes

Tests require registered agents with various statuses. Use registerAgent + deregisterAgent from F-3. For relative time tests, use fixed timestamps relative to Date.now().
