---
id: "F-16"
feature: "Web dashboard server"
status: "draft"
created: "2026-02-03"
---

# Specification: Web Dashboard Server

## Overview

A lightweight HTTP server that exposes the blackboard coordination state as a REST API and serves a static web dashboard. Built with Bun.serve(), it integrates with the existing database and reuses core query functions to provide read-only access to blackboard state. All API responses follow the same JSON envelope format used by the CLI.

## User Scenarios

### Scenario 1: Developer monitors agent coordination

**As a** PAI operator developing multi-agent systems
**I want to** visit `http://localhost:8080/` and see live agent status, work items, and recent events
**So that** I can observe coordination in real-time without CLI commands

**Acceptance Criteria:**
- [ ] HTTP server starts on port 8080 by default
- [ ] Static HTML dashboard loads at `/`
- [ ] Dashboard displays agent status counts (active, idle, stale, completed)
- [ ] Dashboard displays work item counts by status
- [ ] Dashboard updates every 2 seconds via fetch() to API endpoints

### Scenario 2: External tools query blackboard via REST

**As a** tool builder integrating with the blackboard
**I want to** call REST API endpoints and receive JSON with consistent envelope format
**So that** I can programmatically monitor and respond to blackboard state

**Acceptance Criteria:**
- [ ] `GET /api/status` returns overall status in JSON envelope
- [ ] `GET /api/agents` returns agent list in JSON envelope (default: active/idle)
- [ ] `GET /api/work` returns work items in JSON envelope (default: available)
- [ ] `GET /api/events` accepts query params: `since=`, `filter=`, `limit=`
- [ ] All responses have `{ ok, timestamp, count?, items?, ...data }` structure
- [ ] Server responds within 100ms for <1000 items

### Scenario 3: Local network access for ops debugging

**As a** PAI operator on local network
**I want to** access the dashboard from another machine on the same subnet
**So that** I can monitor a long-running agent swarm remotely

**Acceptance Criteria:**
- [ ] Server listens on `0.0.0.0` (all interfaces), not just `localhost`
- [ ] CORS headers allow requests from any origin (for local dev)
- [ ] Dashboard works from `http://<machine-ip>:8080/`

## Functional Requirements

### FR-1: HTTP server initialization

Bun.serve() listening on configurable port (default 8080). Server accepts options: `{ port?, ssl? }`. Port can be overridden by `--port` flag or `$BLACKBOARD_PORT` env variable.

**Validation:** `createServer(db, dbPath, 8080)` starts server; `curl http://localhost:8080/` responds.

### FR-2: Static dashboard at `/`

Serve `src/web/dashboard.html` at GET `/`. Returns `text/html` with CORS headers. If file missing, return 404 with clear error.

**Validation:** `curl http://localhost:8080/` returns HTML content-type.

### FR-3: GET /api/status

Returns overall blackboard status (agent counts, work counts, projects, events_24h, active_agents list). Uses `getOverallStatus(db, dbPath)` from `status.ts`. Response envelope: `{ ok: true, ...status, timestamp }`.

**Validation:** API response includes `database`, `agents` (object), `work_items` (object), `projects` (number), `events_24h` (number), `active_agents` (array).

### FR-4: GET /api/agents

Returns agent list with optional filtering. Query params: `status=` (comma-separated), `all=` (boolean). Uses `listAgents(db, opts)` from `agent.ts`. Response envelope: `{ ok: true, count, items: [...], timestamp }`.

**Validation:** `GET /api/agents` returns active/idle; `GET /api/agents?all=true` returns all statuses; `GET /api/agents?status=completed` filters.

### FR-5: GET /api/work

Returns work item list with optional filtering. Query params: `status=` (comma-separated), `all=` (boolean). Uses `listWorkItems(db, opts)` from `work.ts`. Response envelope: `{ ok: true, count, items: [...], timestamp }`.

**Validation:** `GET /api/work` returns available items; `GET /api/work?all=true` returns all statuses; `GET /api/work?status=claimed,blocked` filters.

### FR-6: GET /api/events

Returns event list with optional filtering. Query params: `since=` (duration string, e.g., "1h", "30m"), `filter=` (comma-separated event types), `limit=` (number, default 50). Uses `observeEvents(db, opts)` from `events.ts`. Response envelope: `{ ok: true, count, items: [...], timestamp }`.

**Validation:** `GET /api/events?since=1h` returns events from last hour; `GET /api/events?filter=agent_registered,work_created` filters by type; `GET /api/events?limit=100` overrides default.

### FR-7: CORS headers

All responses include headers: `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET, OPTIONS`, `Access-Control-Allow-Headers: Content-Type`. Handle OPTIONS requests with 200 + headers.

**Validation:** Preflight request from browser (OPTIONS) succeeds with CORS headers.

### FR-8: Error handling

- 404 for undefined routes
- 400 for invalid query params (bad duration, invalid status, invalid limit)
- 500 for database errors
- All error responses in JSON: `{ ok: false, error: "...", timestamp }`

**Validation:** Invalid duration returns 400 with error message; database disconnect returns 500.

## Non-Functional Requirements

- **Performance:** API responses <100ms for <1000 items, <500ms for 10k items (database query bound)
- **Availability:** Server self-heals on database reconnect; no state retained
- **Scalability:** No in-memory caching of blackboard state; read-only queries only
- **Security:** Read-only access only (no POST/PUT/DELETE); CORS for local dev only (consider IP restriction for production)

## Key Entities

| Endpoint | Data Source | Response Structure |
|----------|-------------|-------------------|
| GET / | `src/web/dashboard.html` | HTML document |
| GET /api/status | `getOverallStatus()` | Single object + metadata |
| GET /api/agents | `listAgents()` | Array of agents |
| GET /api/work | `listWorkItems()` | Array of work items |
| GET /api/events | `observeEvents()` | Array of events |

## Success Criteria

- [ ] Server starts with `blackboard serve --port 8080`
- [ ] All API endpoints respond with correct JSON envelope format
- [ ] Dashboard HTML loads and displays agent/work summaries
- [ ] Query parameters are parsed and passed to core functions
- [ ] CORS headers present on all responses
- [ ] Invalid queries return 400 with descriptive error
- [ ] Database errors return 500 with error message

## Assumptions

| Assumption | What Would Invalidate It | Detection Strategy |
|-----------|-------------------------|-------------------|
| Bun.serve() is stable for long-running servers | Bun drops server support | Test with 24h uptime |
| Dashboard HTML can be bundled with binary | Build system doesn't include assets | Test in CI |
| SQLite concurrent reads don't require locking | App crashes under load | Load test with concurrent requests |

## System Context

### Upstream Dependencies

| System | What We Get | What Breaks If It Changes | Version/Contract |
|--------|-------------|---------------------------|------------------|
| `status.ts:getOverallStatus` | Blackboard metrics | API signature change | Existing signature |
| `agent.ts:listAgents` | Agent list with filtering | API signature change | Existing signature |
| `work.ts:listWorkItems` | Work item list with filtering | API signature change | Existing signature |
| `events.ts:observeEvents` | Event list with filtering | API signature change | Existing signature |
| Bun runtime | HTTP server via `Bun.serve()` | Server crashes | Bun 1.x |

### Downstream Consumers

| System | What They Expect | Breaking Change Threshold |
|--------|-----------------|--------------------------|
| Web dashboard (HTML) | JSON structure from /api endpoints | Endpoint path/response shape change |
| External API consumers | Consistent JSON envelope + CORS | Envelope format change |
| Operations tools | Stable port + predictable query params | Port allocation change, param removal |

## Out of Scope

- Web socket support (polling only)
- Database write operations (read-only)
- Authentication/authorization (local dev only)
- Dashboard styling (minimal working HTML)
- OpenAPI/Swagger documentation
- HTTP caching headers
- Request rate limiting
