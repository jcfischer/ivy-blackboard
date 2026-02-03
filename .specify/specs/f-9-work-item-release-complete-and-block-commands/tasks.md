---
feature: "Work item release, complete, and block commands"
plan: "./plan.md"
status: "pending"
total_tasks: 5
completed: 0
---

# Tasks: Work Item Release, Complete, and Block Commands

## Legend

- `[T]` - Test required (TDD mandatory - write test FIRST)
- `depends: T-X.Y` - Must complete after specified task(s)

## Task Groups

### Group 1: Core release and complete

- [ ] **T-1.1** Implement releaseWorkItem [T]
  - File: `src/work.ts` (modify)
  - Test: `tests/work.test.ts` (modify)
  - Description: Add `releaseWorkItem(db, itemId, sessionId)`. Validate item exists (WORK_ITEM_NOT_FOUND), session exists (AGENT_NOT_FOUND), item is claimed (NOT_CLAIMED), item is claimed by this session (NOT_CLAIMED_BY_SESSION), item is not completed (ALREADY_COMPLETED). Transaction: set status='available', claimed_by=NULL, claimed_at=NULL. Emit `work_released` event. Return ReleaseWorkItemResult.

- [ ] **T-1.2** Implement completeWorkItem [T] (depends: T-1.1)
  - File: `src/work.ts`
  - Test: `tests/work.test.ts`
  - Description: Add `completeWorkItem(db, itemId, sessionId)`. Same validations as release. Transaction: set status='completed', completed_at=now (retain claimed_by for history). Emit `work_completed` event. Return CompleteWorkItemResult.

### Group 2: Core block and unblock

- [ ] **T-2.1** Implement blockWorkItem and unblockWorkItem [T] (depends: T-1.1)
  - File: `src/work.ts`
  - Test: `tests/work.test.ts`
  - Description: `blockWorkItem(db, itemId, opts?)`: validate item exists, not completed. Set status='blocked', blocked_by=opts.blockedBy. Retain claimed_by if was claimed. Emit `work_blocked` event. `unblockWorkItem(db, itemId)`: validate item exists, is blocked (NOT_BLOCKED). Restore status based on claimed_by presence (claimed if set, available if null). Clear blocked_by. Emit `work_released` event. Return respective result types.

### Group 3: Wire CLI commands

- [ ] **T-3.1** Wire release and complete CLI commands [T] (depends: T-1.1, T-1.2)
  - File: `src/commands/work.ts` (modify)
  - Test: `tests/work.test.ts`
  - Description: Replace release stub: parse --id, --session, call releaseWorkItem. Human output: "Released work item: {id}\nStatus: available". Replace complete stub: parse --id, --session, call completeWorkItem. Human output: "Completed work item: {id}\nCompleted at: {time}". Both use withErrorHandling and formatJson for JSON mode.

- [ ] **T-3.2** Add block and unblock CLI commands [T] (depends: T-2.1)
  - File: `src/commands/work.ts`
  - Test: `tests/work.test.ts`
  - Description: Add `work block --id <id> [--blocked-by <item-id>]` subcommand. Add `work unblock --id <id>` subcommand. Both use withErrorHandling and support --json. Human output describes status transition.

## Dependency Graph

```
T-1.1 ──┬──> T-1.2 ──> T-3.1
         └──> T-2.1 ──> T-3.2
```

## Execution Order

1. **T-1.1** releaseWorkItem
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

### Test Notes

Tests require work items created via createWorkItem and agents via registerAgent (both from previous features). Claim items before testing release/complete. Create items in various states to test block/unblock transitions.
