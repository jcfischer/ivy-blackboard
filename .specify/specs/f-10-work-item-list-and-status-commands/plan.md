---
feature: "Work item list and status commands"
spec: "./spec.md"
status: "draft"
---

# Technical Plan: Work Item List and Status Commands

## Architecture Overview

Add `listWorkItems` and `getWorkItemStatus` functions to `src/work.ts` (created by F-8). Replace list and status stubs in `src/commands/work.ts`. List supports filtering by project, status, and priority. Status shows single-item detail with event history.

```
CLI (commands/work.ts list + status subcommands)
    |
    v
Core logic (work.ts)
    |
    ├─ listWorkItems(db, opts?) → BlackboardWorkItem[]
    └─ getWorkItemStatus(db, itemId) → WorkItemDetail
    |
    v
Database (work_items + events tables)
```

## Constitutional Compliance

- [x] **CLI-First:** Commands already stubbed
- [x] **Library-First:** Core logic in work.ts
- [x] **Test-First:** TDD for list, filter, status
- [x] **Deterministic:** Same DB state = same output

## Data Model

Reads from existing `work_items` and `events` tables. No schema changes.

### List options

```typescript
interface ListWorkItemsOptions {
  all?: boolean;
  status?: string;    // comma-separated
  priority?: string;  // comma-separated
  project?: string;
}
```

### Status detail output

```typescript
interface WorkItemDetail {
  item: BlackboardWorkItem;
  history: BlackboardEvent[];
}
```

## API Contracts

```typescript
function listWorkItems(db: Database, opts?: ListWorkItemsOptions): BlackboardWorkItem[];
function getWorkItemStatus(db: Database, itemId: string): WorkItemDetail;
```

## Implementation Strategy

### Phase 1: Core list function
- Default: query WHERE status='available'
- --all: no status filter
- --status: comma-separated, validate against WORK_ITEM_STATUSES
- --priority: comma-separated, validate against WORK_ITEM_PRIORITIES
- --project: filter by project_id
- Order: priority ASC (P1 first), then created_at DESC
- Filters combine with AND

### Phase 2: Core status function
- Query single item by item_id (throw if not found)
- Query events WHERE target_id=item_id AND target_type='work_item' ORDER BY timestamp
- Return item + history

### Phase 3: Wire CLI commands
- Replace list stub: listWorkItems → formatTable
  - Columns: ID, TITLE, PROJECT, STATUS, PRIORITY, CLAIMED BY, CREATED
  - CREATED uses formatRelativeTime
  - Empty: "No work items."
- Replace status stub: getWorkItemStatus → detailed view
  - Show all item fields + event history timeline

## File Structure

```
src/
├── work.ts             # [Modify] Add listWorkItems, getWorkItemStatus
├── commands/work.ts    # [Modify] Replace list + status stubs

tests/
├── work.test.ts        # [Modify] Add list + status tests
```

## Dependencies

### Internal
- F-1: Schema (work_items, events tables)
- F-5: formatRelativeTime from output.ts
- F-8: work.ts module (createWorkItem for test setup)

## Estimated Complexity

- **New files:** 0
- **Modified files:** 2 (work.ts, commands/work.ts)
- **Test files:** 1 (modify)
- **Estimated tasks:** 4
