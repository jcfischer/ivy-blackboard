---
feature: "Work item create and claim commands"
plan: "./plan.md"
status: "pending"
total_tasks: 5
completed: 0
---

# Tasks: Work Item Create and Claim Commands

## Legend

- `[T]` - Test required (TDD mandatory - write test FIRST)
- `depends: T-X.Y` - Must complete after specified task(s)

## Task Groups

### Group 1: Core create function

- [ ] **T-1.1** Implement createWorkItem core function [T]
  - File: `src/work.ts` (new)
  - Test: `tests/work.test.ts` (new)
  - Description: Create `createWorkItem(db, opts: CreateWorkItemOptions)` that inserts into work_items with created_at = now, status = 'available'. Validate source against WORK_ITEM_SOURCES (default 'local'), priority against WORK_ITEM_PRIORITIES (default 'P2'). Handle UNIQUE constraint on item_id with friendly error. Validate metadata as JSON if provided. Emit `work_created` event with item_id and title in summary. All in one transaction. Returns CreateWorkItemResult.

### Group 2: Core claim function

- [ ] **T-2.1** Implement claimWorkItem core function [T] (depends: T-1.1)
  - File: `src/work.ts`
  - Test: `tests/work.test.ts`
  - Description: Create `claimWorkItem(db, itemId, sessionId)` that validates session exists (throw AGENT_NOT_FOUND), validates item exists (throw WORK_ITEM_NOT_FOUND), then UPDATE work_items SET status='claimed', claimed_by=sessionId, claimed_at=now WHERE item_id=? AND status='available'. Check changes: 0 = conflict (return claimed=false), 1 = success. Emit `work_claimed` event on success. Returns ClaimWorkItemResult.

- [ ] **T-2.2** Implement createAndClaimWorkItem [T] (depends: T-1.1, T-2.1)
  - File: `src/work.ts`
  - Test: `tests/work.test.ts`
  - Description: Create `createAndClaimWorkItem(db, opts, sessionId)` that inserts work item then claims it in a single transaction. Emits both `work_created` and `work_claimed` events. Returns CreateWorkItemResult with status='claimed'.

### Group 3: Edge cases

- [ ] **T-3.1** Handle error cases [T] (depends: T-2.1)
  - File: `src/work.ts`
  - Test: `tests/work.test.ts`
  - Description: Test: invalid source throws with valid values listed, invalid priority throws with valid values listed, duplicate item_id throws with ID in message, claim non-existent item throws, claim with non-existent session throws, claim already-claimed item returns claimed=false (no error).

### Group 4: Wire CLI command

- [ ] **T-4.1** Wire claim CLI command [T] (depends: T-2.2)
  - File: `src/commands/work.ts` (modify)
  - Test: `tests/work.test.ts`
  - Description: Replace claim stub action. Parse --id (required), --title, --description, --project, --source, --source-ref, --priority, --session, --metadata. Route: if --title provided with --session → createAndClaimWorkItem. If --title without --session → createWorkItem. If no --title with --session → claimWorkItem. Human output: show item_id, title, status, claimed_by. JSON: formatJson(result).

## Dependency Graph

```
T-1.1 ──┬──> T-2.1 ──> T-2.2 ──> T-4.1
         │         │
         │         └──> T-3.1
```

## Execution Order

1. **T-1.1** Core createWorkItem
2. **T-2.1** Core claimWorkItem
3. **Parallel:** T-2.2, T-3.1 (after T-2.1)
4. **T-4.1** Wire CLI (after T-2.2)

## Progress Tracking

| Task | Status | Started | Completed | Notes |
|------|--------|---------|-----------|-------|
| T-1.1 | pending | - | - | |
| T-2.1 | pending | - | - | |
| T-2.2 | pending | - | - | |
| T-3.1 | pending | - | - | |
| T-4.1 | pending | - | - | |

## TDD Enforcement (MANDATORY)

### Test Notes

Tests use temp databases with full schema. createWorkItem needed for claimWorkItem tests. Register agents with registerAgent for claim session validation.
