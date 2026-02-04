---
feature_id: "F-13"
status: "draft"
---

# Implementation Plan: Overall Status Command

## Current State

`src/commands/status.ts` already exists with near-complete implementation:
- ✅ Agent counts by status
- ✅ Work item counts by status
- ✅ Project count
- ✅ Events in last 24h
- ✅ Active agents list with formatting
- ✅ JSON and human-readable output modes

**Missing:** Database file size calculation.

## Implementation Strategy

**Single-function approach:** Add `getOverallStatus()` core function and wire it to existing CLI command.

### Architecture Decision: Database Size

**Options:**
1. Include size in `getOverallStatus()` return value
2. Calculate in CLI command only
3. Skip size (mark as out-of-scope)

**Chosen:** Option 1 - Include in core function.

**Rationale:**
- Makes function output complete (matches spec contract)
- Useful for monitoring/scripting via JSON output
- Simple implementation (fs.statSync)
- Falls back gracefully on error

## Changes Required

### 1. Extract Core Function (src/core/status.ts)

**New file:** Create `src/core/status.ts`

```typescript
import type { Database } from "bun:sqlite";
import fs from "fs";

export interface OverallStatus {
  database: string;
  database_size: string;
  agents: Record<string, number>;
  work_items: Record<string, number>;
  projects: number;
  events_24h: number;
  active_agents: Array<{
    session_id: string;
    agent_name: string;
    project: string | null;
    current_work: string | null;
    last_seen_at: string;
  }>;
}

export function getOverallStatus(db: Database, dbPath: string): OverallStatus
```

**Logic:**
1. Run 5 SQL queries (agent counts, work counts, project count, events, active agents)
2. Calculate database size:
   - `fs.statSync(dbPath).size` → bytes
   - Format: < 1024 = "N bytes", < 1MB = "N.N KB", else "N.N MB"
   - On error: "unknown"
3. Return structured object

### 2. Update CLI Command (src/commands/status.ts)

**Changes:**
- Import `getOverallStatus()` from `../core/status`
- Replace inline queries with function call
- Add database size to human output
- Keep existing formatting logic

**Before (lines 16-53):**
```typescript
const agentCounts = db.query(...).all();
const workCounts = db.query(...).all();
// ... etc
```

**After:**
```typescript
import { getOverallStatus } from "../core/status";

const status = getOverallStatus(db, ctx.dbPath);
```

## Testing Strategy

### Unit Tests (tests/core/status.test.ts)

**Setup:** In-memory database with known data:
- 2 active agents, 1 idle, 1 completed
- 3 available work items, 1 claimed, 2 completed
- 2 projects
- 10 events (8 in last 24h, 2 older)

**Test cases:**
1. **Populated database** - Verify all counts match expected
2. **Empty database** - All counts should be zero, no errors
3. **Database size formatting:**
   - Mock dbPath to known file sizes
   - Verify "bytes", "KB", "MB" formatting thresholds
4. **Missing file** - Should return "unknown" for size, not crash
5. **Active agents** - Verify array contains only active agents with correct fields

### Integration Test

Use existing test helpers (setupTestDb):
- Create real SQLite file
- Populate with known data
- Call getOverallStatus with real file path
- Verify size is non-zero string

## Implementation Order

1. **Write tests first** (TDD):
   - Create `tests/core/status.test.ts`
   - All tests RED (function doesn't exist yet)

2. **Implement core function:**
   - Create `src/core/status.ts`
   - Implement `getOverallStatus()`
   - Tests GREEN

3. **Refactor CLI command:**
   - Update `src/commands/status.ts`
   - Add database size to output
   - Manual verification with real database

4. **Verify:**
   - Run all 163+ existing tests (no regressions)
   - Run new status tests
   - Test with `blackboard status` in real project

## Edge Cases

| Case | Handling |
|------|----------|
| Empty database | All counts zero, active_agents = [] |
| No active agents | Empty table section not shown in human output |
| Database file unreadable | size = "unknown", queries still work |
| Very large database | Format correctly (e.g., "2.3 GB") |
| Missing status values | Default to 0 in count maps |

## Dependencies

- **Upstream:** F-1 (schema), F-3 (agents), F-7 (projects), F-8 (work items)
- **Downstream:** None (read-only command)
- **External:** Node.js `fs` module (already in use)

## Success Metrics

- Function returns correct structure matching `OverallStatus` interface
- Database size formatted as human-readable string
- All existing tests continue to pass
- New tests achieve 100% coverage of getOverallStatus()
- CLI outputs match spec examples
