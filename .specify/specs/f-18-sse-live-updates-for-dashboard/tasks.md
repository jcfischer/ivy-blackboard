---
feature: "SSE Live Updates for Dashboard"
plan: "./plan.md"
status: "pending"
total_tasks: 2
completed: 0
---

# Tasks: SSE Live Updates for Dashboard

## Legend

- `[T]` - Test required (TDD mandatory - write test FIRST)
- `[P]` - Can run in parallel with other [P] tasks in same group
- `depends: T-X.Y` - Must complete after specified task(s)

## Task Groups

### Group 1: SSE Server Implementation

- [ ] **T-1.1** Add SSE endpoint to src/server.ts [T]
  - File: `src/server.ts`
  - Test: `tests/server.test.ts`
  - Description: Add new HTTP route handler for GET `/api/events/stream` that:
    - Returns HTTP 200 with headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
    - Creates a ReadableStream that polls `events` table every 2 seconds
    - Tracks last_event_id (initialize to 0 or last event in DB)
    - Queries events where `id > last_sent_id` (prevent duplicates)
    - For each new event, enqueues SSE message: `id: N\ndata: {JSON}\n\n`
    - Cleans up interval on connection close (req.signal abort)
    - Handles errors gracefully (log error, close connection)
  - Acceptance:
    - SSE endpoint responds to GET request
    - Multiple clients can connect simultaneously
    - Events stream in real-time (new DB inserts appear <100ms)
    - No duplicate events sent
    - Connection closes cleanly and cleanup runs

### Group 2: Dashboard Client Implementation

- [ ] **T-2.1** Update dashboard.html to use EventSource for live events (depends: T-1.1) [T]
  - File: `src/web/dashboard.html` (JavaScript section)
  - Test: `tests/web/dashboard.test.ts`
  - Description: Modify F-17 dashboard to:
    - Add `startEventSource()` function that creates new EventSource connection to `/api/events/stream`
    - Listen for `onmessage` events, parse JSON, prepend to events table via `prependEvent()`
    - Handle `onerror` by closing EventSource, setting `fallbackToPolling = true`, attempting reconnect after 5s
    - Modify `refresh()` to skip events fetch if EventSource is connected and healthy
    - Keep polling fallback: if `fallbackToPolling = true`, refresh events every 5s via normal polling
    - Add optional `updateConnectionStatus()` to show "Connected" (SSE) or "Polling" in UI
    - Limit events table to last 50 rows (insert at top, remove from bottom) for performance
  - Acceptance:
    - EventSource connection made to `/api/events/stream` on page load
    - New events appear in table within 100ms of database insert
    - Browser Network tab shows single long-lived EventSource connection (not polling)
    - Connection auto-reconnects if coordinator restarts
    - Falls back to polling if SSE unavailable (events still show after 5s refresh)
    - No duplicate events in table
    - Handles disconnection gracefully

## Dependency Graph

```
T-1.1 ──┐
         └──> T-2.1
```

## Execution Order

1. **T-1.1** (SSE endpoint)
2. **T-2.1** (EventSource client, after T-1.1 deployed)

## Progress Tracking

| Task | Status | Started | Completed | Notes |
|------|--------|---------|-----------|-------|
| T-1.1 | pending | - | - | |
| T-2.1 | pending | - | - | |

## TDD Enforcement (MANDATORY)

**CRITICAL:** Every task marked [T] MUST follow the RED-GREEN-BLUE cycle.

### The TDD Cycle

For each task marked [T]:

1. **RED:** Write failing test FIRST (verify test fails on empty/stub implementation)
2. **GREEN:** Write MINIMAL implementation to pass
3. **BLUE:** Refactor while keeping tests green
4. **VERIFY:** Run full test suite (`bun test`)

### Test Coverage Requirements

- **T-1.1:** Contract test for SSE message format, integration test for streaming behavior
- **T-2.1:** Client test for EventSource connection, event parsing, DOM updates, fallback behavior

## Blockers & Issues

| Task | Issue | Resolution |
|------|-------|------------|
| - | - | - |

## Post-Implementation Verification

### Functional Verification
- [ ] SSE endpoint accessible at `/api/events/stream`
- [ ] Events table in dashboard receives new events within 100ms of database insert
- [ ] Network tab shows single EventSource connection (not polling)
- [ ] Connection auto-reconnects if killed
- [ ] Fallback to polling works if SSE unavailable
- [ ] No duplicate events in dashboard
- [ ] Events table limited to ~50 rows (no infinite growth)

### Streaming Behavior Verification
- [ ] Insert event directly into database, observe appears in dashboard <100ms
- [ ] Stop coordinator, verify dashboard shows "Polling" or falls back
- [ ] Restart coordinator, verify automatic reconnect within 5s
- [ ] Multiple browsers open dashboard simultaneously, all receive same events
- [ ] Interval between database polls is 2 seconds (check logs/metrics)

### Failure Mode Verification
- [ ] EventSource connection closed, events still update via polling (fallback)
- [ ] Network disconnect simulated (DevTools), reconnect on recovery
- [ ] Database connection lost, SSE error handled gracefully
- [ ] Very old browser (no EventSource support), verify polling fallback works

### Performance Verification
- [ ] 10+ simultaneous connections: no memory leak, no slowdown
- [ ] 100 events/second: all delivered, no lag
- [ ] CPU usage: <5% idle, <15% during active streaming
- [ ] Memory per connection: <1MB

### Code Quality Verification
- [ ] ReadableStream cleanup on connection close verified
- [ ] No console errors from SSE client code
- [ ] Error messages are helpful (log event type, IDs, timestamps)
- [ ] No duplicate event IDs sent
- [ ] Message format matches SSE spec exactly

### Sign-off
- [ ] All verification items checked
- Date completed: ___
