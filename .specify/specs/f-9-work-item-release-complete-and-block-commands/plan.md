---
feature: "Work item release, complete, and block commands"
spec: "./spec.md"
status: "draft"
---

# Technical Plan: Work Item Release, Complete, and Block Commands

## Architecture Overview

Add `releaseWorkItem`, `completeWorkItem`, `blockWorkItem`, and `unblockWorkItem` functions to `src/work.ts` (created by F-8). Replace release and complete stubs in `src/commands/work.ts`. Add block and unblock subcommands.

```
CLI (commands/work.ts release + complete + block + unblock subcommands)
    |
    v
Core logic (work.ts)
    |
    ├─ releaseWorkItem(db, itemId, sessionId) → ReleaseWorkItemResult
    ├─ completeWorkItem(db, itemId, sessionId) → CompleteWorkItemResult
    ├─ blockWorkItem(db, itemId, opts?) → BlockWorkItemResult
    └─ unblockWorkItem(db, itemId) → UnblockWorkItemResult
    |
    v
Database (work_items + events tables)
```

## Constitutional Compliance

- [x] **CLI-First:** release and complete stubs exist, block/unblock are new subcommands
- [x] **Library-First:** Core logic in work.ts, CLI thin wrapper
- [x] **Test-First:** TDD for all four operations + error cases
- [x] **Deterministic:** Same DB state = same output

## Data Model

Uses existing `work_items`, `agents`, and `events` tables. No schema changes.

### Release output

```typescript
interface ReleaseWorkItemResult {
  item_id: string;
  released: boolean;
  previous_status: string;
}
```

### Complete output

```typescript
interface CompleteWorkItemResult {
  item_id: string;
  completed: boolean;
  completed_at: string;
  claimed_by: string;
}
```

### Block output

```typescript
interface BlockWorkItemResult {
  item_id: string;
  blocked: boolean;
  blocked_by: string | null;
  previous_status: string;
}
```

### Unblock output

```typescript
interface UnblockWorkItemResult {
  item_id: string;
  unblocked: boolean;
  restored_status: string;
}
```

## API Contracts

```typescript
function releaseWorkItem(db: Database, itemId: string, sessionId: string): ReleaseWorkItemResult;
function completeWorkItem(db: Database, itemId: string, sessionId: string): CompleteWorkItemResult;
function blockWorkItem(db: Database, itemId: string, opts?: { blockedBy?: string }): BlockWorkItemResult;
function unblockWorkItem(db: Database, itemId: string): UnblockWorkItemResult;
```

## Implementation Strategy

### Phase 1: releaseWorkItem
- Validate item exists (throw WORK_ITEM_NOT_FOUND)
- Validate session exists (throw AGENT_NOT_FOUND)
- Validate item.status === 'claimed' (throw NOT_CLAIMED)
- Validate item.claimed_by === sessionId (throw NOT_CLAIMED_BY_SESSION)
- Check item.status !== 'completed' (throw ALREADY_COMPLETED)
- Transaction: UPDATE status='available', claimed_by=NULL, claimed_at=NULL
- Emit `work_released` event

### Phase 2: completeWorkItem
- Same validations as release (exists, session, claimed, claimed_by)
- Transaction: UPDATE status='completed', completed_at=now (retain claimed_by)
- Emit `work_completed` event

### Phase 3: blockWorkItem
- Validate item exists
- Validate item.status !== 'completed' (throw ALREADY_COMPLETED)
- Validate item.status !== 'blocked' (idempotent? or error — spec says any non-completed)
- Transaction: UPDATE status='blocked', blocked_by=opts.blockedBy
- If was claimed, retain claimed_by
- Emit `work_blocked` event

### Phase 4: unblockWorkItem
- Validate item exists
- Validate item.status === 'blocked' (throw NOT_BLOCKED)
- If claimed_by is set, restore status='claimed'; else status='available'
- Clear blocked_by
- Emit event (use `work_released` since no `work_unblocked` type exists)

### Phase 5: Wire CLI commands
- Replace release stub: parse --id, --session; call releaseWorkItem
- Replace complete stub: parse --id, --session; call completeWorkItem
- Add block subcommand: parse --id, --blocked-by; call blockWorkItem
- Add unblock subcommand: parse --id; call unblockWorkItem
- All use withErrorHandling and support --json

## Error Code Matrix

| Function | Error Code | Condition |
|----------|-----------|-----------|
| release/complete | WORK_ITEM_NOT_FOUND | item_id not in DB |
| release/complete | AGENT_NOT_FOUND | session_id not in DB |
| release/complete | NOT_CLAIMED | item.status !== 'claimed' |
| release/complete | NOT_CLAIMED_BY_SESSION | item.claimed_by !== sessionId |
| release/complete/block | ALREADY_COMPLETED | item.status === 'completed' |
| unblock | NOT_BLOCKED | item.status !== 'blocked' |

## File Structure

```
src/
├── work.ts             # [Modify] Add release, complete, block, unblock
├── commands/work.ts    # [Modify] Replace stubs, add block/unblock subcommands

tests/
├── work.test.ts        # [Modify] Add release, complete, block, unblock tests
```

## Dependencies

### Internal
- F-1: Schema (work_items, events tables)
- F-3: Agent module (session validation)
- F-8: work.ts module (createWorkItem, claimWorkItem for test setup)

## Estimated Complexity

- **New files:** 0
- **Modified files:** 2 (work.ts, commands/work.ts)
- **Test files:** 1 (modify)
- **Estimated tasks:** 5
