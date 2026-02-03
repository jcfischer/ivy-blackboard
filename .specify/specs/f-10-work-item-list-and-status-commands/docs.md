# Documentation: F-10 Work Item List and Status Commands

## Files Created

None (all modifications to existing files).

## Files Modified

| File | Change |
|------|--------|
| `src/work.ts` | Added listWorkItems, getWorkItemStatus, ListWorkItemsOptions, WorkItemDetail |
| `src/commands/work.ts` | Replaced list and status stubs with wired commands |

## Usage

```bash
# List available work items (default)
blackboard work list

# List all work items regardless of status
blackboard work list --all

# Filter by status
blackboard work list --status claimed
blackboard work list --status "available,claimed"

# Filter by priority
blackboard work list --priority P1
blackboard work list --priority "P1,P2"

# Filter by project
blackboard work list --project my-project

# Combined filters
blackboard work list --status claimed --priority P1 --project my-project

# JSON output
blackboard work list --json

# Show detailed status with event history
blackboard work status task-1

# JSON detail
blackboard work status task-1 --json
```

## API Reference

### `listWorkItems(db, opts?): BlackboardWorkItem[]`
Lists work items with optional filters. Default: status='available'. Order: priority ASC (P1 first), then created_at DESC. Filters combine with AND.

**Options:** `all?` (no status filter), `status?` (comma-separated), `priority?` (comma-separated), `project?`

### `getWorkItemStatus(db, itemId): WorkItemDetail`
Returns detailed status for a single work item including full event history. Throws `WORK_ITEM_NOT_FOUND` if item doesn't exist.

**Returns:** `{ item: BlackboardWorkItem, history: BlackboardEvent[] }`
