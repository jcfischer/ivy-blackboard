---
feature: "Work item list and status commands"
plan: "./plan.md"
status: "pending"
total_tasks: 4
completed: 0
---

# Tasks: Work Item List and Status Commands

## Legend

- `[T]` - Test required (TDD mandatory - write test FIRST)
- `depends: T-X.Y` - Must complete after specified task(s)

## Task Groups

### Group 1: Core list function

- [ ] **T-1.1** Implement listWorkItems core function [T]
  - File: `src/work.ts` (modify — created by F-8)
  - Test: `tests/work.test.ts` (modify)
  - Description: Create `listWorkItems(db, opts?: ListWorkItemsOptions)` that queries work_items. Default: status='available'. With opts.all: no status filter. With opts.status: parse comma-separated, validate against WORK_ITEM_STATUSES. With opts.priority: parse comma-separated, validate against WORK_ITEM_PRIORITIES. With opts.project: filter by project_id. Filters combine with AND. Order by priority ASC (P1 first), then created_at DESC. Returns BlackboardWorkItem[].

- [ ] **T-1.2** Handle filter validation [T] (depends: T-1.1)
  - File: `src/work.ts`
  - Test: `tests/work.test.ts`
  - Description: Invalid status throws BlackboardError with valid values listed. Invalid priority throws BlackboardError. Non-existent project returns empty array (not an error). Empty result returns empty array.

### Group 2: Core status function

- [ ] **T-2.1** Implement getWorkItemStatus core function [T] (depends: T-1.1)
  - File: `src/work.ts`
  - Test: `tests/work.test.ts`
  - Description: Create `getWorkItemStatus(db, itemId)` that queries single work item by item_id (throw WORK_ITEM_NOT_FOUND if missing). Query events WHERE target_id=itemId AND target_type='work_item' ORDER BY timestamp ASC. Returns WorkItemDetail { item, history }.

### Group 3: Wire CLI commands

- [ ] **T-3.1** Wire list and status CLI commands [T] (depends: T-1.1, T-2.1)
  - File: `src/commands/work.ts` (modify)
  - Test: `tests/work.test.ts`
  - Description: Replace list stub: parse --all, --status, --priority, --project. Call listWorkItems. Human: formatTable with columns ID (truncated 12), TITLE, PROJECT, STATUS, PRIORITY, CLAIMED BY (truncated 12 or "-"), CREATED (formatRelativeTime). Empty: "No work items." JSON: formatJson(items). Replace status stub: parse <id> argument. Call getWorkItemStatus. Human: show all fields + event history timeline. JSON: formatJson({ ...item, history }).

## Dependency Graph

```
T-1.1 ──┬──> T-1.2
         └──> T-2.1 ──> T-3.1
                    /
T-1.1 ────────────/
```

## Execution Order

1. **T-1.1** Core listWorkItems
2. **Parallel:** T-1.2, T-2.1 (after T-1.1)
3. **T-3.1** Wire CLI (after T-1.1, T-2.1)

## Progress Tracking

| Task | Status | Started | Completed | Notes |
|------|--------|---------|-----------|-------|
| T-1.1 | pending | - | - | |
| T-1.2 | pending | - | - | |
| T-2.1 | pending | - | - | |
| T-3.1 | pending | - | - | |

## TDD Enforcement (MANDATORY)

### Test Notes

Tests require work items created via createWorkItem (F-8) and agents via registerAgent (F-3). For status history tests, claim then release items to generate events.
