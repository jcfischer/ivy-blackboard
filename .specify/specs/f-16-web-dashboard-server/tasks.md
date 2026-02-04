---
feature: "Web dashboard server"
plan: "./plan.md"
status: "pending"
total_tasks: 3
completed: 0
---

# Tasks: Web Dashboard Server

## Legend

- `[T]` - Test required (TDD mandatory - write test FIRST)
- `[P]` - Can run in parallel with other [P] tasks in same group
- `depends: T-X.Y` - Must complete after specified task(s)

## Task Groups

### Group 1: Server Foundation

- [ ] **T-1.1** Create HTTP server with route handler [T]
  - File: `src/server.ts`
  - Test: `tests/server.test.ts`
  - Description: Export `createServer(db: Database, dbPath: string, port: number = 8080): { close(): void }` function using Bun.serve(). Implement request handler that matches URL.pathname and HTTP method. Handle GET /, GET /api/*, OPTIONS, and 404. Return all responses with CORS headers (Access-Control-Allow-Origin: *, Access-Control-Allow-Methods: GET, OPTIONS, Access-Control-Allow-Headers: Content-Type). Import and call `formatJson()` from output.ts for all API responses. Parse query params from URL.search using `new URL()`.

### Group 2: API Endpoints

- [ ] **T-2.1** Implement /api/status, /api/agents, /api/work endpoints [T] (depends: T-1.1)
  - File: `src/server.ts` (additions)
  - Test: `tests/server.test.ts` (additions)
  - Description: Wire route handlers for GET /api/status (calls `getOverallStatus(db, dbPath)`, wraps with formatJson), GET /api/agents (parses `status=`, `all=` query params, calls `listAgents(db, opts)`, wraps), GET /api/work (parses `status=`, `all=` query params, calls `listWorkItems(db, opts)`, wraps). Each endpoint returns JSON envelope with ok, count, items, timestamp. Test with various query param combinations and verify response structure matches formatJson output.

- [ ] **T-2.2** Implement /api/events endpoint and dashboard at / [T] (depends: T-1.1)
  - File: `src/server.ts` (additions), `src/web/dashboard.html` (new)
  - Test: `tests/server.test.ts` (additions)
  - Description: Wire route handler for GET /api/events (parses `since=` duration string, `filter=` comma-separated event types, `limit=` number, calls `observeEvents(db, opts)`, wraps response). Create minimal `src/web/dashboard.html` that displays agent/work/event counts fetched from /api/status every 2 seconds using fetch() and setInterval(). Both GET / and /api/events tested for correct response structure and error handling (invalid duration returns 400, etc).

### Group 3: CLI Integration

- [ ] **T-3.1** Wire serve command and create server startup [T] (depends: T-2.2)
  - File: `src/commands/serve.ts`
  - Test: `tests/commands/serve.test.ts`
  - Description: Create serve command that accepts `--port <number>` flag (default 8080). Command resolves database using existing context, calls `createServer(db, dbPath, port)`. Implement startup message: "Blackboard server running on http://localhost:PORT". Handle SIGINT gracefully (Ctrl+C) by calling server.close() and exiting. Test server startup with different ports, verify HTTP response to GET /, and verify shutdown on SIGINT.

## Dependency Graph

```
T-1.1 ──┬──> T-2.1 ──┐
         │            └──> T-3.1
         └──> T-2.2 ──┘
```

## Execution Order

1. **T-1.1** - Server foundation (required for both T-2.x tasks)
2. **Parallel batch:** T-2.1, T-2.2 (after T-1.1)
3. **T-3.1** - CLI integration (after T-2.2)

## Progress Tracking

| Task | Status | Started | Completed | Notes |
|------|--------|---------|-----------|-------|
| T-1.1 | pending | - | - | |
| T-2.1 | pending | - | - | |
| T-2.2 | pending | - | - | |
| T-3.1 | pending | - | - | |

## TDD Enforcement (MANDATORY)

**CRITICAL:** Every task marked [T] MUST follow the RED-GREEN-BLUE cycle.

### The TDD Cycle

For each task marked [T]:

1. **RED:** Write failing test FIRST
2. **GREEN:** Write MINIMAL implementation to pass
3. **BLUE:** Refactor while keeping tests green
4. **VERIFY:** Run full test suite (`bun test`)

### Test Coverage Requirements

- **Minimum ratio:** 0.5 (test files / source files)
- **Every source file** should have a corresponding test file

## Blockers & Issues

| Task | Issue | Resolution |
|------|-------|------------|
| - | - | - |

## Post-Implementation Verification

### Functional Verification
- [ ] `blackboard serve` starts server on port 8080
- [ ] `GET http://localhost:8080/` returns HTML
- [ ] `GET http://localhost:8080/api/status` returns JSON with ok, timestamp, agents, projects, etc.
- [ ] `GET http://localhost:8080/api/agents` returns agent list
- [ ] `GET http://localhost:8080/api/work` returns work item list
- [ ] `GET http://localhost:8080/api/events?since=1h` returns events from last hour
- [ ] Invalid query param (e.g., `?since=invalid`) returns 400 with error
- [ ] OPTIONS request returns 200 with CORS headers
- [ ] Ctrl+C stops server gracefully

### Integration Verification
- [ ] Server responds correctly to concurrent requests
- [ ] Query param parsing works for all endpoints
- [ ] JSON envelope structure matches CLI formatJson output
- [ ] Dashboard HTML loads and fetches from API endpoints

### Failure Verification
- [ ] Port in use error returns clear message, suggests --port
- [ ] Dashboard file missing returns 404 with clear error
- [ ] Database error during query returns 500 with error message

### Sign-off
- [ ] All verification items checked
- Date completed: ___
