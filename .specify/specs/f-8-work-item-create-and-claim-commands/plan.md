---
feature: "Work item create and claim commands"
spec: "./spec.md"
status: "draft"
---

# Technical Plan: Work Item Create and Claim Commands

## Architecture Overview

Create a new `src/work.ts` module with `createWorkItem`, `claimWorkItem`, and `createAndClaimWorkItem` core functions. Replace the claim stub in `src/commands/work.ts`. Work item creation validates source/priority, claim uses atomic UPDATE WHERE status='available'.

```
CLI (commands/work.ts claim subcommand)
    |
    v
Core logic (work.ts)
    |
    ├─ createWorkItem(db, opts) → CreateWorkItemResult
    ├─ claimWorkItem(db, itemId, sessionId) → ClaimWorkItemResult
    └─ createAndClaimWorkItem(db, opts) → CreateWorkItemResult
    |
    v
Database (work_items + events tables)
```

## Constitutional Compliance

- [x] **CLI-First:** Command already stubbed
- [x] **Library-First:** Core logic in work.ts, CLI thin wrapper
- [x] **Test-First:** TDD for create, claim, create-and-claim
- [x] **Deterministic:** Same inputs = same DB state (UUID for item_id only when not provided)

## Data Model

Uses existing `work_items`, `agents`, and `events` tables. No schema changes.

### Create input

```typescript
interface CreateWorkItemOptions {
  id: string;
  title: string;
  description?: string;
  project?: string;
  source?: string;    // default 'local', validate against WORK_ITEM_SOURCES
  sourceRef?: string;
  priority?: string;  // default 'P2', validate against WORK_ITEM_PRIORITIES
  metadata?: string;  // JSON string
}
```

### Create output

```typescript
interface CreateWorkItemResult {
  item_id: string;
  title: string;
  status: string;        // 'available' or 'claimed'
  claimed_by: string | null;
  claimed_at: string | null;
  created_at: string;
}
```

### Claim output

```typescript
interface ClaimWorkItemResult {
  item_id: string;
  claimed: boolean;      // true if claim succeeded, false if conflict
  claimed_by: string | null;
  claimed_at: string | null;
}
```

## API Contracts

```typescript
function createWorkItem(db: Database, opts: CreateWorkItemOptions): CreateWorkItemResult;
function claimWorkItem(db: Database, itemId: string, sessionId: string): ClaimWorkItemResult;
function createAndClaimWorkItem(db: Database, opts: CreateWorkItemOptions, sessionId: string): CreateWorkItemResult;
```

## Implementation Strategy

### Phase 1: Core create function
- Insert into work_items with created_at = now
- Validate source against WORK_ITEM_SOURCES, priority against WORK_ITEM_PRIORITIES
- Handle duplicate item_id with friendly error
- Emit `work_created` event
- One transaction

### Phase 2: Core claim function
- UPDATE WHERE item_id=? AND status='available'
- Check changes: 0 = conflict (return claimed=false), 1 = success
- Validate session exists (throw if not)
- Validate item exists (throw if not, when no title provided)
- Emit `work_claimed` event on success
- One transaction

### Phase 3: Create-and-claim
- Both create + claim in single transaction
- Call pattern: insert item, then claim atomically
- Emits both `work_created` and `work_claimed` events

### Phase 4: Wire CLI command
- Replace claim stub
- Parse options, route to create-and-claim (if --title) or claim-only
- If no --session, create without claiming (status='available')

## File Structure

```
src/
├── work.ts             # [New] createWorkItem, claimWorkItem, createAndClaimWorkItem
├── commands/work.ts    # [Modify] Replace claim stub

tests/
├── work.test.ts        # [New] Core logic + CLI E2E tests
```

## Dependencies

### Internal
- F-1: Schema (work_items, events tables)
- F-2: CLI framework (command stubs, output helpers)
- F-3: Agent module (session validation for claim)

## Estimated Complexity

- **New files:** 1 (work.ts)
- **Modified files:** 1 (commands/work.ts)
- **Test files:** 1 (new)
- **Estimated tasks:** 5
