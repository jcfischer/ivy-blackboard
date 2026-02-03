# Documentation: F-8 Work Item Create and Claim Commands

## Files Created

| File | Purpose |
|------|---------|
| `src/work.ts` | Core logic: createWorkItem, claimWorkItem, createAndClaimWorkItem |

## Files Modified

| File | Change |
|------|--------|
| `src/commands/work.ts` | Replaced claim stub with routing logic |

## Usage

```bash
# Create a work item (available for claiming)
blackboard work claim --id "task-1" --title "Implement schema"

# Create with full details
blackboard work claim --id "task-1" --title "Fix bug" --source github --source-ref "issues/42" --priority P1 --project pai-collab

# Create and claim in one step
blackboard work claim --id "task-1" --title "My task" --session <session-id>

# Claim an existing available item
blackboard work claim --id "task-1" --session <session-id>

# JSON output
blackboard work claim --id "task-1" --title "Task" --json
```

## API Reference

### `createWorkItem(db, opts): CreateWorkItemResult`
Creates work item with validated source/priority, emits `work_created` event. Throws on duplicate item_id or invalid values.

**Options:** `id` (required), `title` (required), `description?`, `project?`, `source?` (default 'local'), `sourceRef?`, `priority?` (default 'P2'), `metadata?`

### `claimWorkItem(db, itemId, sessionId): ClaimWorkItemResult`
Atomically claims available item. Returns `claimed: false` on conflict (no error). Validates session and item exist.

### `createAndClaimWorkItem(db, opts, sessionId): CreateWorkItemResult`
Creates and claims in single transaction. Emits both `work_created` and `work_claimed` events.
