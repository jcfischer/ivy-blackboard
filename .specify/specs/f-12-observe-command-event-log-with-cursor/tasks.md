---
feature: "Observe command — event log with cursor"
plan: "./plan.md"
status: "pending"
total_tasks: 3
completed: 0
---

# Tasks: Observe Command — Event Log with Cursor

## Legend

- `[T]` - Test required (TDD mandatory - write test FIRST)
- `[P]` - Can run in parallel with other [P] tasks in same group
- `depends: T-X.Y` - Must complete after specified task(s)

## Task Groups

### Group 1: Core events module

- [ ] **T-1.1** Implement events module with observeEvents and parseDuration [T]
  - File: `src/events.ts` (new)
  - Test: `tests/events.test.ts` (new)
  - Description: Create `src/events.ts` with two exports:
    1. `parseDuration(duration: string): number` - Parse "1h", "30m", "2d" format. Returns seconds. Regex: `/^(\d+)([smhd])$/`. Multipliers: s=1, m=60, h=3600, d=86400. Throw BlackboardError on invalid format.
    2. `observeEvents(db: Database, opts?: ObserveEventsOptions): BlackboardEvent[]` - Query events table with filters. Default: ORDER BY timestamp ASC LIMIT 50. opts.since: WHERE timestamp >= datetime('now', '-X seconds') using parseDuration. opts.type: parse comma-separated, validate against EVENT_TYPES, WHERE event_type IN (...). opts.session: WHERE actor_id LIKE '<prefix>%' OR actor_id = '<full>'. opts.limit: LIMIT <n>. Return BlackboardEvent[] from query.

### Group 2: Output formatting

- [ ] **T-2.1** Implement formatTimeline for event display [T] [P]
  - File: `src/output.ts` (modify)
  - Test: `tests/output.test.ts` (modify)
  - Description: Add `formatTimeline(events: BlackboardEvent[]): string`. For each event, format line: "[relative_time] [event_type] [actor:12chars] summary". Use existing formatRelativeTime for timestamp. Actor field shows first 12 chars if present, or "system" if null. Join lines with newline. Return single string.

### Group 3: Wire CLI command

- [ ] **T-3.1** Wire observe CLI command [T] (depends: T-1.1, T-2.1)
  - File: `src/commands/observe.ts` (modify)
  - Test: `tests/events.test.ts`
  - Description: Replace stub action with real implementation. Parse options from Commander: --since, --type (maps to type field), --session, --limit. Map --filter option name to type in opts object. Call `observeEvents(ctx.db, opts)`. Human output: if empty, print "No events.", else call formatTimeline and print. JSON output: `formatJson({ count: events.length, items: events })`.

## Dependency Graph

```
T-1.1 ───┬──> T-3.1
         │
T-2.1 ───┘
```

## Execution Order

1. **Parallel:** T-1.1, T-2.1
2. **T-3.1** (after both complete)

## Progress Tracking

| Task | Status | Started | Completed | Notes |
|------|--------|---------|-----------|-------|
| T-1.1 | pending | - | - | |
| T-2.1 | pending | - | - | |
| T-3.1 | pending | - | - | |

## TDD Enforcement (MANDATORY)

### Test Notes

Tests require event records in the events table. Create test events using direct INSERT statements with various timestamps, event types, and actor_id values. For --since tests, use datetime('now', '-X seconds') in INSERT. For parseDuration tests, use fixed input/output pairs.
