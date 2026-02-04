---
feature: "Observe command — event log with cursor"
spec: "./spec.md"
status: "draft"
---

# Technical Plan: Observe Command — Event Log with Cursor

## Architecture Overview

Add an `observeEvents` function to a new `src/events.ts` module that queries the events table with filtering options. Add a `parseDuration` utility to handle time duration strings. Wire into the existing observe stub in `src/commands/observe.ts`.

```
CLI (commands/observe.ts)
    |
    v
Core logic (events.ts) — NEW MODULE
    |
    └─ observeEvents(db, opts) → BlackboardEvent[]
    |
    v
Output formatting (output.ts)
    |
    └─ formatTimeline(events) → string
```

## Constitutional Compliance

- [x] **CLI-First:** Command already stubbed
- [x] **Library-First:** Core query in events.ts module
- [x] **Test-First:** TDD for query and parsing

## Data Model

Reads from existing `events` table. No schema changes.

### Observe options

```typescript
interface ObserveEventsOptions {
  since?: string;     // duration string: "1h", "30m", "2d"
  type?: string;      // comma-separated event types
  session?: string;   // actor_id filter (partial match)
  limit?: number;     // default 50
}
```

## API Contracts

```typescript
// src/events.ts (NEW)
function observeEvents(db: Database, opts?: ObserveEventsOptions): BlackboardEvent[];
function parseDuration(duration: string): number; // returns seconds

// src/output.ts (MODIFY)
function formatTimeline(events: BlackboardEvent[]): string;
```

## Implementation Strategy

### Phase 1: Duration parsing utility
- [ ] Add `parseDuration` to events.ts
- [ ] Handles: "Xs", "Xm", "Xh", "Xd"
- [ ] Throws BlackboardError on invalid format

### Phase 2: Core observe function
- [ ] Default: ORDER BY timestamp ASC LIMIT 50
- [ ] --since: WHERE timestamp >= datetime('now', '-X seconds')
- [ ] --type: parse comma-separated, validate against EVENT_TYPES, WHERE event_type IN (...)
- [ ] --session: WHERE actor_id LIKE '<prefix>%' OR actor_id = '<id>'
- [ ] --limit: LIMIT <n>

### Phase 3: Timeline formatting
- [ ] Add `formatTimeline` to output.ts
- [ ] Format: "[timestamp] [type] [actor:12chars] summary"
- [ ] Use existing formatRelativeTime for timestamps

### Phase 4: Wire CLI command
- [ ] Replace observe stub with observeEvents → formatTimeline
- [ ] Parse options: --since, --type, --session, --limit
- [ ] Human output: timeline format
- [ ] JSON output: formatJson({ count, items })

## File Structure

```
src/
├── events.ts           # [New] Core observe logic
├── output.ts           # [Modify] Add formatTimeline
├── commands/observe.ts # [Modify] Replace stub

tests/
├── events.test.ts      # [New] Observe tests
├── output.test.ts      # [Modify] Add timeline format tests
```

## Dependencies

### Internal
- F-1: events table schema
- F-2: output.ts (formatJson, formatRelativeTime)
- F-3+: event creation from various commands (for test data)

## Estimated Complexity

- **New files:** 2 (events.ts, events.test.ts)
- **Modified files:** 2 (output.ts, commands/observe.ts)
- **Test files:** 2 (new + modify)
- **Estimated tasks:** 3
