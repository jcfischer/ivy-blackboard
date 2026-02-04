---
feature: "Web dashboard server"
spec: "./spec.md"
status: "draft"
---

# Technical Plan: Web Dashboard Server

## Architecture Overview

A single `server.ts` module that creates an HTTP server with Bun.serve(). Route handler matches incoming requests and delegates to core functions (`getOverallStatus`, `listAgents`, `listWorkItems`, `observeEvents`) imported from existing modules. All responses use the standard JSON envelope from `output.ts`.

```
CLI: blackboard serve --port 8080
    |
    v
commands/serve.ts
    |
    v
createServer(db, dbPath, port)
    |
    ├─ GET /               → readFileSync(dashboard.html) → HTML
    ├─ GET /api/status    → getOverallStatus() → JSON envelope
    ├─ GET /api/agents    → listAgents(opts) → JSON envelope
    ├─ GET /api/work      → listWorkItems(opts) → JSON envelope
    ├─ GET /api/events    → observeEvents(opts) → JSON envelope
    ├─ OPTIONS *          → 200 + CORS headers
    └─ * (undefined)      → 404 + JSON envelope
```

## Technology Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| HTTP Server | Bun.serve() | Native Bun API, no external dependency |
| Routing | Manual URL.pathname matching | Minimal, predictable, no frameworks |
| Response Format | JSON envelope from output.ts | Consistency with CLI |
| Dashboard | Plain HTML + fetch() | No build tooling, simple polling |

## Constitutional Compliance

- [x] **Library-First:** `server.ts` is a pure library module, instantiated by CLI
- [x] **CLI-First:** Launched via `blackboard serve` command, not separate binary
- [x] **Test-First:** Unit tests for route matching, JSON envelope validation, query param parsing
- [x] **Simplicity Gate:** Single route handler, reuse existing query functions
- [x] **Integration-First:** Tests use real database (no mocks)

## Data Model

### TypeScript interfaces

```typescript
interface ServerOptions {
  port?: number;      // Default 8080
  ssl?: boolean;      // For future HTTPS support
}

interface ApiResponse<T> {
  ok: boolean;
  timestamp: string;
  count?: number;
  items?: T[];
  error?: string;
  // ...spread data for single objects
}
```

## API Contracts

### HTTP Routes

```typescript
// Server creation
function createServer(
  db: Database,
  dbPath: string,
  port: number = 8080
): { close(): void };

// Returns { ok: boolean, close(): void } for testing/shutdown
```

### Request Handling (Internal)

```typescript
// Route handler matching URL paths and HTTP methods
function handleRequest(req: Request, db: Database, dbPath: string): Response;

// Query param parsing
function parseQueryParams(url: URL): Record<string, string>;

// Response building
function buildJsonResponse(data: any, ok: boolean = true): Response;
function buildErrorResponse(error: string, statusCode: number = 400): Response;
```

## Implementation Strategy

### Phase 1: Server foundation

- [ ] `createServer(db, dbPath, port)` function setting up Bun.serve()
- [ ] Request handler matching GET, OPTIONS, 404
- [ ] CORS headers on all responses
- [ ] Unit test for server startup and shutdown

### Phase 2: Route handlers

- [ ] GET `/` serves static HTML from `src/web/dashboard.html`
- [ ] GET `/api/status` calls `getOverallStatus()`, wraps in JSON envelope
- [ ] GET `/api/agents` parses query params, calls `listAgents()`, wraps response
- [ ] GET `/api/work` parses query params, calls `listWorkItems()`, wraps response
- [ ] GET `/api/events` parses query params, calls `observeEvents()`, wraps response
- [ ] Unit tests for each endpoint with various query params

### Phase 3: CLI integration

- [ ] `commands/serve.ts` receives --port flag, resolves database, calls createServer()
- [ ] Server runs until SIGINT (Ctrl+C) received
- [ ] Integration test: start server, make HTTP request, verify response

### Phase 4: Dashboard HTML

- [ ] `src/web/dashboard.html` with minimal HTML
- [ ] fetch() to /api/status every 2 seconds
- [ ] Display agent/work/event summaries
- [ ] No build tools (raw HTML + inline JS)

## File Structure

```
src/
├── server.ts                # [New] HTTP server: createServer, route handlers
├── commands/serve.ts        # [New] CLI command: parse --port, start server
├── web/
│   └── dashboard.html       # [New] Static dashboard with fetch polling

tests/
├── server.test.ts           # [New] Route handling, JSON envelope, query params
├── commands/serve.test.ts   # [New] CLI integration, startup/shutdown
```

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Bun.serve() incompatibility with platform | High | Low | Test on CI for all platforms |
| Dashboard HTML bundling in binary | Medium | Low | Verify file exists on startup, error clearly |
| Concurrent database reads under load | Medium | Low | SQLite handles this; test with 100 concurrent requests |
| Port already in use (8080) | Low | Medium | Check port availability, return clear error, suggest --port |

## Failure Mode Analysis

| Failure Mode | Trigger | Detection | Degradation | Recovery |
|-------------|---------|-----------|-------------|----------|
| Port in use | `--port 8080` when 8080 taken | Server startup fails | CLI exits with error | User specifies different port |
| Dashboard file missing | Binary built without assets | HTTP 404 at `/` | Dashboard unavailable, API works | Rebuild binary |
| Database disconnects mid-request | Network loss or db corruption | Query throws error | API returns 500 | Automatic reconnect next request |
| Invalid query param (bad duration) | `?since=invalid` | `observeEvents` throws | Return 400 with error | Client fixes query string |

## Dependencies

### External

- `bun:fs` (Bun built-in) — readFileSync for dashboard.html
- `bun:sqlite` (already imported) — database queries
- `node:url` (Bun built-in) — URL parsing and query params

### Internal

- `status.ts:getOverallStatus` — overall metrics
- `agent.ts:listAgents` — agent list with filtering
- `work.ts:listWorkItems` — work items with filtering
- `events.ts:observeEvents` — events with filtering
- `output.ts:formatJson` — JSON envelope formatting
- `db.ts` — database handle from CLI
- `context.ts:CommandContext` — context object structure

## Migration/Deployment

- [ ] No database migrations needed
- [ ] No environment variables required (optional `$BLACKBOARD_PORT`)
- [ ] No breaking changes to CLI or database
- [ ] Server is optional feature (users can skip `serve` command)

## Estimated Complexity

- **New files:** 3 (`server.ts`, `commands/serve.ts`, `dashboard.html`)
- **Modified files:** 0
- **Test files:** 2
- **Estimated tasks:** 3
- **Debt score:** 1 (clean, isolated feature)

## Longevity Assessment

### Maintainability Indicators

| Indicator | Status | Notes |
|-----------|--------|-------|
| **Readability:** Can a developer understand routing logic in 6 months? | Yes | Route handler is straightforward if/else or switch |
| **Testability:** Can changes be verified without manual browser testing? | Yes | Unit tests cover route matching, JSON structure, query param parsing |
| **Documentation:** Is the "why" captured? | Yes | Architecture doc explains reuse of core functions |

### Evolution Vectors

| What Might Change | Preparation | Impact |
|------------------|-------------|--------|
| Add WebSocket support | Separate WS module, keep HTTP isolated | Low |
| Add authentication | Middleware pattern, check token in handler | Medium |
| Change dashboard UI | Separate HTML file, no logic changes needed | Low |
| Add more endpoints | Pattern is established (query param parsing) | Low |

### Deletion Criteria

- [ ] Feature superseded by: external web framework/dashboard
- [ ] Dependency deprecated: Bun.serve() removed
- [ ] User need eliminated: local development no longer needs real-time dashboard
- [ ] Maintenance cost exceeds value when: dashboard becomes unmaintainable
