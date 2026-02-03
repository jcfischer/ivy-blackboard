# Local Agent Blackboard Architecture

**Proposal for pai-collab issue #78**
**Author:** @jcfischer (Ivy)
**Date:** 2026-02-03
**Status:** Proposal -- ready for community review

---

## 1. Overview

The Local Agent Blackboard is the third and innermost layer of pai-collab's coordination architecture. While the hub (pai-collab repo) coordinates across operators via GitHub issues and PRs, and the spoke (`.collab/` in contributor repos) exposes project status to the network, the local layer solves a different problem: **multiple agents running simultaneously on a single operator's machine have no visibility into each other.** An operator spawning a Claude Code session in one terminal, a Task tool delegate in another, and a background agent via the Delegate skill currently has three blind processes that can duplicate work, conflict on files, and exhaust shared resources without awareness. The local blackboard provides a lightweight SQLite-based coordination surface where agents register their presence, claim work items, broadcast progress, and detect stale peers -- all without requiring a persistent daemon, external services, or network exposure.

```
+---------------------------------------------------------------------+
|                        OPERATOR'S MACHINE                            |
|                                                                      |
|   +------------------+  +------------------+  +------------------+   |
|   | Claude Code      |  | Task Delegate    |  | Background Agent |   |
|   | Session          |  | (child of main)  |  | (Delegate skill) |   |
|   +--------+---------+  +--------+---------+  +--------+---------+   |
|            |                      |                      |           |
|            v                      v                      v           |
|   +--------------------------------------------------------------+   |
|   |              LOCAL BLACKBOARD (SQLite)                        |   |
|   |  ~/.pai/blackboard/local.db   (operator-wide)                |   |
|   |  .blackboard/local.db         (per-project)                  |   |
|   |                                                              |   |
|   |  Tables: agents, projects, work_items, heartbeats, events    |   |
|   +------------------------------+-------------------------------+   |
|                                  |                                   |
+----------------------------------+-----------------------------------+
                                   |
                                   | blackboard status --export
                                   v
                    +------------------------------+
                    |  SPOKE (.collab/status.yaml) |
                    |  What the network sees       |
                    +---------------+--------------+
                                    |
                                    | blackboard pull (hub reads spokes)
                                    v
                    +------------------------------+
                    |  HUB (pai-collab repo)       |
                    |  Cross-operator coordination |
                    +------------------------------+
```

### Design Constraints (from prior decisions)

These constraints are settled and non-negotiable. They come from the council debate, PAI Founding Principles analysis, and community discussion on issue #78:

1. **SQLite, not YAML.** Concurrent writes require ACID transactions. YAML has known concurrency failure modes and vulnerability classes (billion laughs, anchor bombs). SQLite provides row-level locking, schema validation, and WAL mode for concurrent readers.

2. **No token quota in the blackboard.** Token budget is a runtime concern -- it belongs where API calls are made (PAI runtime), not in the coordination layer. The blackboard tracks *what agents are doing*, not *how much they are spending*.

3. **Dual location.** `~/.pai/blackboard/` for operator-wide state, `.blackboard/` for per-project state. The `BLACKBOARD_HOME` environment variable allows platform-agnostic override.

4. **Tool named `blackboard`.** Generic, not tied to pai-collab. Operates on blackboards at any level.

5. **No persistent daemon.** PAI is CLI-first. Agents register on start, write heartbeats during work, and deregister on exit. Stale detection uses PID verification + timestamp checks, not a monitoring process.

6. **Awareness model, not assignment model.** Agents see each other and make their own decisions about what to work on (PAI Principle 14 -- Agent Personalities). The blackboard does not assign tasks to interchangeable workers.

7. **Security by design.** File permissions, content filtering on writes, no external input sources. Attack vectors identified during council review are mitigated architecturally, not retrofitted.

---

## 2. SQLite Schema

The database uses WAL (Write-Ahead Logging) mode for concurrent reads during writes. All timestamps are ISO 8601 UTC strings. The schema balances normalization with practical query patterns -- five tables covering the six primitives (REGISTER, QUERY, CLAIM, RELEASE, HEARTBEAT, OBSERVE).

### Database initialization

```sql
-- Enable WAL mode for concurrent read access during writes
PRAGMA journal_mode = WAL;

-- Enable foreign key enforcement
PRAGMA foreign_keys = ON;

-- Set a reasonable busy timeout for concurrent access (5 seconds)
PRAGMA busy_timeout = 5000;
```

### agents table

Tracks all agent sessions -- active, completed, and stale. This is the REGISTER primitive.

```sql
CREATE TABLE agents (
    session_id    TEXT PRIMARY KEY,           -- unique per session (UUID v4)
    agent_name    TEXT NOT NULL,              -- display name ("Ivy", "Ivy (delegate)")
    pid           INTEGER,                    -- OS process ID for liveness check
    parent_id     TEXT,                       -- session_id of parent (for delegates)
    project       TEXT,                       -- current project context
    current_work  TEXT,                       -- free-text description of current task
    status        TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'idle', 'completed', 'stale')),
    started_at    TEXT NOT NULL,              -- ISO 8601
    last_seen_at  TEXT NOT NULL,              -- ISO 8601 (updated on heartbeat)
    metadata      TEXT,                       -- JSON blob for extensibility

    FOREIGN KEY (parent_id) REFERENCES agents(session_id)
);

CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agents_project ON agents(project);
CREATE INDEX idx_agents_parent ON agents(parent_id);
CREATE INDEX idx_agents_last_seen ON agents(last_seen_at);
```

### projects table

Registers projects that agents can work on. Links to external sources (GitHub repos, local paths).

```sql
CREATE TABLE projects (
    project_id    TEXT PRIMARY KEY,           -- slug: "pai-secret-scanning"
    display_name  TEXT NOT NULL,              -- "PAI Secret Scanning"
    local_path    TEXT,                       -- absolute path on disk
    remote_repo   TEXT,                       -- "jcfischer/pai-secret-scanning"
    registered_at TEXT NOT NULL,              -- ISO 8601
    metadata      TEXT                        -- JSON blob (branch, status, etc.)
);
```

### work_items table

Trackable units of work that agents can claim. This is the CLAIM/RELEASE primitive. Items can come from GitHub issues, local tasks, or operator-defined work.

```sql
CREATE TABLE work_items (
    item_id       TEXT PRIMARY KEY,           -- "gh:mellanon/pai-collab#78" or "local:fix-tests"
    project_id    TEXT,                       -- FK to projects
    title         TEXT NOT NULL,
    description   TEXT,
    source        TEXT NOT NULL               -- "github", "local", "operator"
                  CHECK (source IN ('github', 'local', 'operator')),
    source_ref    TEXT,                       -- external reference (issue URL, file path)
    status        TEXT NOT NULL DEFAULT 'available'
                  CHECK (status IN ('available', 'claimed', 'completed', 'blocked')),
    priority      TEXT DEFAULT 'P2'
                  CHECK (priority IN ('P1', 'P2', 'P3')),
    claimed_by    TEXT,                       -- FK to agents.session_id
    claimed_at    TEXT,                       -- ISO 8601
    completed_at  TEXT,                       -- ISO 8601
    blocked_by    TEXT,                       -- item_id of blocking work item
    created_at    TEXT NOT NULL,              -- ISO 8601
    metadata      TEXT,                       -- JSON blob

    FOREIGN KEY (project_id) REFERENCES projects(project_id),
    FOREIGN KEY (claimed_by) REFERENCES agents(session_id)
);

CREATE INDEX idx_work_items_status ON work_items(status);
CREATE INDEX idx_work_items_project ON work_items(project_id);
CREATE INDEX idx_work_items_claimed_by ON work_items(claimed_by);
CREATE INDEX idx_work_items_priority ON work_items(priority, status);
```

### heartbeats table

Append-only log of agent heartbeats. Used for stale detection trending and historical analysis. The primary liveness check uses `agents.last_seen_at`, but this table provides the audit trail.

```sql
CREATE TABLE heartbeats (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id    TEXT NOT NULL,
    timestamp     TEXT NOT NULL,              -- ISO 8601
    progress      TEXT,                       -- optional progress note
    work_item_id  TEXT,                       -- what the agent is working on

    FOREIGN KEY (session_id) REFERENCES agents(session_id),
    FOREIGN KEY (work_item_id) REFERENCES work_items(item_id)
);

CREATE INDEX idx_heartbeats_session ON heartbeats(session_id, timestamp);
CREATE INDEX idx_heartbeats_timestamp ON heartbeats(timestamp);
```

### events table

The OBSERVE primitive. An append-only event log that captures all state changes. Agents use this to catch up on what happened since they last checked.

```sql
CREATE TABLE events (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp     TEXT NOT NULL,              -- ISO 8601
    event_type    TEXT NOT NULL
                  CHECK (event_type IN (
                      'agent_registered', 'agent_deregistered', 'agent_stale',
                      'agent_recovered',
                      'work_claimed', 'work_released', 'work_completed',
                      'work_blocked', 'work_created',
                      'project_registered', 'project_updated',
                      'heartbeat_received',
                      'stale_locks_released'
                  )),
    actor_id      TEXT,                       -- session_id of the agent that caused this
    target_id     TEXT,                       -- item_id, project_id, or session_id affected
    target_type   TEXT                        -- "agent", "work_item", "project"
                  CHECK (target_type IN ('agent', 'work_item', 'project')),
    summary       TEXT NOT NULL,              -- human-readable description
    metadata      TEXT                        -- JSON blob for structured data
);

CREATE INDEX idx_events_timestamp ON events(timestamp);
CREATE INDEX idx_events_type ON events(event_type);
CREATE INDEX idx_events_actor ON events(actor_id);
```

### Schema version tracking

```sql
CREATE TABLE schema_version (
    version       INTEGER PRIMARY KEY,
    applied_at    TEXT NOT NULL,              -- ISO 8601
    description   TEXT
);

INSERT INTO schema_version (version, applied_at, description)
VALUES (1, datetime('now'), 'Initial local blackboard schema');
```

---

## 3. CLI Commands

The `blackboard` CLI is a Bun + TypeScript tool following PAI conventions (Commander.js, Zod validation). All commands support `--json` for programmatic output and `--db <path>` to override the default database location.

### Default database resolution

```
1. --db <path>              (explicit override)
2. $BLACKBOARD_DB           (environment variable)
3. .blackboard/local.db     (per-project, if .blackboard/ exists)
4. ~/.pai/blackboard/local.db  (operator-wide fallback)
```

### Agent commands

```bash
# Register a new agent session
blackboard agent register \
  --name "Ivy" \
  --project "pai-collab" \
  --work "Designing local blackboard architecture for issue #78"

# Output:
# Registered agent session abc-1234-def
# Name:    Ivy
# Project: pai-collab
# PID:     42567
# Started: 2026-02-03T15:30:00Z

# Register a delegate (child of current session)
blackboard agent register \
  --name "Ivy (delegate)" \
  --parent abc-1234-def \
  --project "pai-secret-scanning" \
  --work "Running test suite"

# Output:
# Registered delegate session ghi-5678-jkl
# Parent:  abc-1234-def (Ivy)
# Project: pai-secret-scanning
# PID:     42890

# Send a heartbeat with progress
blackboard agent heartbeat \
  --session abc-1234-def \
  --progress "Completed SQL schema section, starting CLI design"

# Output:
# Heartbeat recorded for abc-1234-def (Ivy)
# Last seen: 2026-02-03T15:35:00Z
# Progress: Completed SQL schema section, starting CLI design

# List all agents (default: active only)
blackboard agent list

# Output:
# SESSION          NAME              PROJECT              STATUS   LAST SEEN          PID
# abc-1234-def     Ivy               pai-collab           active   2 min ago          42567
# ghi-5678-jkl     Ivy (delegate)    pai-secret-scanning  active   1 min ago          42890

# List all agents including completed and stale
blackboard agent list --all

# List agents as JSON (for programmatic use)
blackboard agent list --json

# Deregister (clean exit)
blackboard agent deregister --session abc-1234-def

# Output:
# Deregistered abc-1234-def (Ivy)
# Released 1 claimed work item(s)
# Session duration: 47 minutes
```

### Project commands

```bash
# Register a project
blackboard project register \
  --id "pai-collab" \
  --name "PAI Collab Blackboard" \
  --path "/Users/fischer/work/pai-collab" \
  --repo "mellanon/pai-collab"

# Output:
# Registered project: pai-collab
# Path:  /Users/fischer/work/pai-collab
# Repo:  mellanon/pai-collab

# List registered projects
blackboard project list

# Output:
# PROJECT              PATH                                REPO                       AGENTS
# pai-collab           /Users/fischer/work/pai-collab      mellanon/pai-collab        2 active
# pai-secret-scanning  /Users/fischer/work/pai-secret...   jcfischer/pai-secret...    0 active

# Show project status with active agents and work items
blackboard project status pai-collab

# Output:
# Project: pai-collab (PAI Collab Blackboard)
# Path:    /Users/fischer/work/pai-collab
# Repo:    mellanon/pai-collab
#
# Active Agents:
#   Ivy (abc-1234-def) -- Designing local blackboard architecture
#   Ivy (delegate) (ghi-5678-jkl) -- Running test suite
#
# Work Items:
#   [P1] [CLAIMED] Design local blackboard schema (claimed by Ivy, 47m ago)
#   [P2] [AVAILABLE] Write web visibility component
#   [P2] [BLOCKED] Post proposal to issue #78 (blocked by: schema design)
```

### Work item commands

```bash
# Create and claim a work item in one step
blackboard work claim \
  --id "design-schema" \
  --title "Design local blackboard SQL schema" \
  --project "pai-collab" \
  --source "github" \
  --source-ref "mellanon/pai-collab#78" \
  --session abc-1234-def

# Output:
# Created and claimed work item: design-schema
# Project:  pai-collab
# Source:   github (mellanon/pai-collab#78)
# Claimed:  Ivy (abc-1234-def)

# Claim an existing available work item
blackboard work claim --id "write-web-component" --session abc-1234-def

# Output:
# Claimed work item: write-web-component
# Previously: available
# Claimed by: Ivy (abc-1234-def)

# Release a claim without completing
blackboard work release --id "design-schema" --session abc-1234-def

# Output:
# Released work item: design-schema
# Status: available (was claimed by Ivy for 23 minutes)

# Mark work as completed
blackboard work complete --id "design-schema" --session abc-1234-def

# Output:
# Completed work item: design-schema
# Duration: 47 minutes (claimed by Ivy)

# List all work items (default: non-completed)
blackboard work list

# Output:
# ITEM                  PROJECT         STATUS     PRIORITY  CLAIMED BY     AGE
# design-schema         pai-collab      claimed    P1        Ivy            47m
# write-web-component   pai-collab      available  P2        --             2h
# post-proposal         pai-collab      blocked    P2        --             2h

# List work items as JSON
blackboard work list --json --project pai-collab

# Show detailed status of a specific work item
blackboard work status design-schema

# Output:
# Item:       design-schema
# Title:      Design local blackboard SQL schema
# Project:    pai-collab
# Source:     github (mellanon/pai-collab#78)
# Status:     claimed
# Priority:   P1
# Claimed by: Ivy (abc-1234-def) at 2026-02-03T15:30:00Z
# Created:    2026-02-03T14:00:00Z
```

### Observe command

```bash
# Show events since last check (maintains a cursor per session)
blackboard observe --session abc-1234-def

# Output:
# Events since last observation (2026-02-03T15:00:00Z):
#
# 15:05:00  agent_registered     Ivy (delegate) registered on pai-secret-scanning
# 15:10:00  work_claimed         Ivy (delegate) claimed "run-tests"
# 15:25:00  work_completed       Ivy (delegate) completed "run-tests"
# 15:26:00  agent_stale          Session xyz-expired marked stale (no heartbeat for 6m)
# 15:26:00  stale_locks_released Released 1 item from stale session xyz-expired
#
# 5 events | Next check will start from 15:26:00

# Show events from a specific time
blackboard observe --since "2026-02-03T14:00:00Z"

# Show events with full detail as JSON
blackboard observe --since "1h" --json

# Show only stale/error events
blackboard observe --filter "agent_stale,stale_locks_released,work_blocked"
```

### Web server command

```bash
# Start the web dashboard (localhost only, default port 3141)
blackboard serve

# Output:
# Blackboard dashboard: http://127.0.0.1:3141
# Database: /Users/fischer/.pai/blackboard/local.db
# Press Ctrl+C to stop

# Custom port
blackboard serve --port 8080

# Background mode (returns immediately, prints PID)
blackboard serve --background

# Output:
# Blackboard dashboard running in background
# URL:  http://127.0.0.1:3141
# PID:  43210
# Stop: kill 43210
```

### Housekeeping commands

```bash
# Run stale detection and cleanup (also runs automatically on any command)
blackboard sweep

# Output:
# Stale detection sweep:
#   Marked stale: 1 agent (session xyz-old, PID 12345 not found)
#   Released: 2 work items from stale agents
#   Pruned: 847 heartbeat records older than 7 days

# Show overall blackboard health
blackboard status

# Output:
# Local Blackboard Status
# Database: /Users/fischer/.pai/blackboard/local.db
# Size:     148 KB
#
# Agents:    2 active, 0 idle, 1 stale, 5 completed (today)
# Projects:  3 registered
# Work:      1 claimed, 2 available, 1 blocked, 8 completed (today)
# Events:    34 (last 24h)
#
# Active Agents:
#   Ivy (abc-1234-def) -- pai-collab -- 47m active
#   Ivy (delegate) (ghi-5678-jkl) -- pai-secret-scanning -- 12m active
```

---

## 4. Agent Integration

### Auto-registration on Claude Code startup

Claude Code sessions auto-register via a PAI hook. The hook fires when a session starts (or resumes) and registers the agent with the local blackboard.

```typescript
// ~/.claude/hooks/blackboard-register.ts
// Hook: session_start (fires on new session and resume)

import { execSync } from "node:child_process";

interface SessionContext {
  sessionId: string;         // Claude Code session ID
  agentName: string;         // from PAI settings.json
  project?: string;          // detected from cwd or git remote
  resuming: boolean;         // true if resuming a prior session
}

function registerAgent(ctx: SessionContext): void {
  const args = [
    "agent", "register",
    "--name", ctx.agentName,
    "--session-hint", ctx.sessionId, // used to generate stable session_id
    "--json"
  ];

  if (ctx.project) {
    args.push("--project", ctx.project);
  }

  try {
    const result = execSync(`blackboard ${args.join(" ")}`, {
      timeout: 5000,
      encoding: "utf-8",
    });
    const registration = JSON.parse(result);

    // Store session_id for heartbeat and deregister hooks
    process.env.BLACKBOARD_SESSION_ID = registration.session_id;
  } catch {
    // Blackboard unavailable -- continue without coordination
    // This is non-fatal: agents work fine without the blackboard
  }
}
```

### Task tool delegate registration

When a Claude Code session spawns a child agent via the Task tool or the Delegate skill, the child registers as a delegate with its parent's session ID.

```typescript
// Integration pattern for Task tool / Delegate skill

interface DelegateRegistration {
  parentSessionId: string;    // from parent's BLACKBOARD_SESSION_ID
  taskDescription: string;    // what the delegate was asked to do
  project?: string;           // inherited from parent or specified
}

function registerDelegate(reg: DelegateRegistration): string {
  const result = execSync(
    `blackboard agent register ` +
    `--name "${agentName} (delegate)" ` +
    `--parent ${reg.parentSessionId} ` +
    `--work "${sanitize(reg.taskDescription)}" ` +
    `${reg.project ? `--project ${reg.project}` : ""} ` +
    `--json`,
    { timeout: 5000, encoding: "utf-8" }
  );
  return JSON.parse(result).session_id;
}
```

### Heartbeat via periodic hook

Heartbeats are sent at the end of each tool use cycle (not on a timer). This piggybacks on existing activity rather than requiring a background timer.

```typescript
// ~/.claude/hooks/blackboard-heartbeat.ts
// Hook: after_tool_use (fires after each tool invocation)

function sendHeartbeat(): void {
  const sessionId = process.env.BLACKBOARD_SESSION_ID;
  if (!sessionId) return; // not registered

  try {
    execSync(
      `blackboard agent heartbeat --session ${sessionId}`,
      { timeout: 2000, encoding: "utf-8" }
    );
  } catch {
    // Non-fatal: heartbeat failure does not interrupt work
  }
}
```

A background heartbeat can alternatively be configured via the shell:

```bash
# In .zshrc or session startup -- fire-and-forget heartbeat every 60s
(while true; do
  blackboard agent heartbeat --session "$BLACKBOARD_SESSION_ID" 2>/dev/null
  sleep 60
done) &
BLACKBOARD_HEARTBEAT_PID=$!
```

### Deregistration on exit

```typescript
// ~/.claude/hooks/blackboard-deregister.ts
// Hook: session_end (fires on clean exit)

function deregisterAgent(): void {
  const sessionId = process.env.BLACKBOARD_SESSION_ID;
  if (!sessionId) return;

  try {
    execSync(
      `blackboard agent deregister --session ${sessionId}`,
      { timeout: 5000, encoding: "utf-8" }
    );
  } catch {
    // If deregister fails, stale detection will clean up
  }
}
```

### JSON output format for programmatic querying

All commands support `--json` for machine consumption. The output follows a consistent envelope:

```typescript
// TypeScript interfaces for blackboard JSON output

interface BlackboardAgent {
  session_id: string;
  agent_name: string;
  pid: number | null;
  parent_id: string | null;
  project: string | null;
  current_work: string | null;
  status: "active" | "idle" | "completed" | "stale";
  started_at: string;        // ISO 8601
  last_seen_at: string;      // ISO 8601
}

interface BlackboardWorkItem {
  item_id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  source: "github" | "local" | "operator";
  source_ref: string | null;
  status: "available" | "claimed" | "completed" | "blocked";
  priority: "P1" | "P2" | "P3";
  claimed_by: string | null;
  claimed_at: string | null;
  completed_at: string | null;
  blocked_by: string | null;
  created_at: string;
}

interface BlackboardEvent {
  id: number;
  timestamp: string;         // ISO 8601
  event_type: string;
  actor_id: string | null;
  target_id: string | null;
  target_type: "agent" | "work_item" | "project" | null;
  summary: string;
}

// Envelope for list commands
interface BlackboardListResponse<T> {
  ok: boolean;
  count: number;
  items: T[];
  timestamp: string;         // ISO 8601
}

// Envelope for status command
interface BlackboardStatusResponse {
  ok: boolean;
  database: string;          // absolute path
  database_size_bytes: number;
  agents: {
    active: number;
    idle: number;
    stale: number;
    completed_today: number;
  };
  projects: {
    registered: number;
  };
  work_items: {
    available: number;
    claimed: number;
    blocked: number;
    completed_today: number;
  };
  events_24h: number;
  active_agents: BlackboardAgent[];
  timestamp: string;
}
```

### Agent context query on startup

When a new agent starts, it queries the blackboard to understand the current landscape before deciding what to work on. This respects PAI Principle 14 -- agents make their own decisions based on context.

```bash
# What an agent runs on startup to understand the current state
blackboard agent list --json --status active
blackboard work list --json --status available,claimed
blackboard observe --since "1h" --json
```

This gives the agent:
- Who else is active and what they are working on (avoid duplication)
- What work items exist and which are available (potential tasks)
- What happened recently (context for decision-making)

---

## 5. Web Visibility Layer

A lightweight Bun HTTP server that reads the SQLite database directly (read-only) and serves a single-page dashboard. No build step, no framework, no authentication (localhost only).

### Server implementation

```typescript
// blackboard-serve.ts
// Launched via: blackboard serve [--port 3141] [--background]

import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";

const DEFAULT_PORT = 3141;

interface ServeOptions {
  port: number;
  dbPath: string;
}

function createServer(opts: ServeOptions) {
  // Open database in read-only mode -- the web server never writes
  const db = new Database(opts.dbPath, { readonly: true });
  db.exec("PRAGMA journal_mode = WAL"); // required for WAL read access

  const dashboard = generateDashboardHTML();

  return Bun.serve({
    port: opts.port,
    hostname: "127.0.0.1", // NEVER bind to 0.0.0.0
    fetch(req) {
      const url = new URL(req.url);

      switch (url.pathname) {
        case "/":
          return new Response(dashboard, {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });

        case "/api/status":
          return Response.json(getStatus(db));

        case "/api/agents":
          return Response.json(getAgents(db));

        case "/api/work":
          return Response.json(getWorkItems(db));

        case "/api/events":
          const since = url.searchParams.get("since") || "24h";
          return Response.json(getEvents(db, since));

        case "/api/events/stream":
          // SSE endpoint for live updates
          return createEventStream(db);

        default:
          return new Response("Not Found", { status: 404 });
      }
    },
  });
}

function getStatus(db: Database): object {
  const agents = db.query(`
    SELECT status, COUNT(*) as count
    FROM agents
    GROUP BY status
  `).all();

  const work = db.query(`
    SELECT status, COUNT(*) as count
    FROM work_items
    GROUP BY status
  `).all();

  const projectCount = db.query(`
    SELECT COUNT(*) as count FROM projects
  `).get();

  const recentEvents = db.query(`
    SELECT COUNT(*) as count
    FROM events
    WHERE timestamp > datetime('now', '-24 hours')
  `).get();

  return { agents, work, projects: projectCount, events_24h: recentEvents };
}

function getAgents(db: Database): object[] {
  return db.query(`
    SELECT
      a.session_id, a.agent_name, a.pid, a.parent_id,
      a.project, a.current_work, a.status,
      a.started_at, a.last_seen_at,
      (SELECT COUNT(*) FROM work_items WHERE claimed_by = a.session_id AND status = 'claimed') as claimed_items,
      p.agent_name as parent_name
    FROM agents a
    LEFT JOIN agents p ON a.parent_id = p.session_id
    WHERE a.status IN ('active', 'idle', 'stale')
    ORDER BY a.started_at DESC
  `).all();
}

function getWorkItems(db: Database): object[] {
  return db.query(`
    SELECT
      w.item_id, w.title, w.project_id, w.source, w.source_ref,
      w.status, w.priority, w.claimed_at, w.completed_at,
      w.blocked_by, w.created_at,
      a.agent_name as claimed_by_name
    FROM work_items w
    LEFT JOIN agents a ON w.claimed_by = a.session_id
    WHERE w.status != 'completed'
    ORDER BY
      CASE w.priority WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 END,
      w.created_at DESC
  `).all();
}

function getEvents(db: Database, since: string): object[] {
  const sinceDate = parseSinceArg(since);
  return db.query(`
    SELECT id, timestamp, event_type, actor_id, target_id,
           target_type, summary
    FROM events
    WHERE timestamp > ?
    ORDER BY timestamp DESC
    LIMIT 200
  `).all(sinceDate);
}

function createEventStream(db: Database): Response {
  let lastEventId = 0;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const interval = setInterval(() => {
        const events = db.query(`
          SELECT id, timestamp, event_type, summary
          FROM events
          WHERE id > ?
          ORDER BY id ASC
          LIMIT 50
        `).all(lastEventId);

        for (const event of events) {
          const data = JSON.stringify(event);
          controller.enqueue(
            encoder.encode(`data: ${data}\n\n`)
          );
          lastEventId = (event as any).id;
        }
      }, 2000); // poll every 2 seconds

      // Cleanup on client disconnect
      return () => clearInterval(interval);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function parseSinceArg(since: string): string {
  const match = since.match(/^(\d+)(m|h|d)$/);
  if (!match) return since; // assume ISO 8601
  const [, amount, unit] = match;
  const map: Record<string, string> = { m: "minutes", h: "hours", d: "days" };
  return new Date(
    Date.now() - parseInt(amount) * { m: 60000, h: 3600000, d: 86400000 }[unit]!
  ).toISOString();
}
```

### Dashboard HTML

A single self-contained HTML page with inline CSS and JavaScript. No external dependencies, no build step, no CDN.

```html
<!-- Generated by generateDashboardHTML() and served from memory -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Blackboard Dashboard</title>
  <style>
    :root {
      --bg: #0d1117;
      --surface: #161b22;
      --border: #30363d;
      --text: #c9d1d9;
      --text-dim: #8b949e;
      --accent: #58a6ff;
      --green: #3fb950;
      --yellow: #d29922;
      --red: #f85149;
      --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: var(--bg); color: var(--text); font-family: var(--font);
      padding: 24px; max-width: 1200px; margin: 0 auto;
    }
    h1 { font-size: 20px; margin-bottom: 24px; color: var(--text); }
    h1 span { color: var(--text-dim); font-weight: normal; font-size: 14px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 32px; }
    .card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 8px; padding: 16px;
    }
    .card-label { color: var(--text-dim); font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    .card-value { font-size: 28px; font-weight: 600; margin-top: 4px; }
    .section { margin-bottom: 32px; }
    .section-title { font-size: 14px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; color: var(--text-dim); font-weight: 500; padding: 8px 12px; border-bottom: 1px solid var(--border); }
    td { padding: 8px 12px; border-bottom: 1px solid var(--border); }
    tr:hover { background: rgba(88, 166, 255, 0.04); }
    .status-active { color: var(--green); }
    .status-idle { color: var(--yellow); }
    .status-stale { color: var(--red); }
    .status-claimed { color: var(--accent); }
    .status-available { color: var(--green); }
    .status-blocked { color: var(--red); }
    .status-completed { color: var(--text-dim); }
    .priority-P1 { color: var(--red); font-weight: 600; }
    .priority-P2 { color: var(--yellow); }
    .priority-P3 { color: var(--text-dim); }
    .event-row { font-size: 12px; }
    .event-time { color: var(--text-dim); white-space: nowrap; width: 80px; }
    .event-type { font-family: monospace; font-size: 11px; padding: 2px 6px; border-radius: 4px; background: var(--bg); }
    .updated { font-size: 11px; color: var(--text-dim); text-align: right; margin-top: 8px; }
    .delegate-indent { padding-left: 28px; }
    .delegate-marker { color: var(--text-dim); margin-right: 4px; }
  </style>
</head>
<body>
  <h1>Blackboard <span>Local Agent Dashboard</span></h1>

  <div class="grid" id="summary-cards"></div>

  <div class="section">
    <div class="section-title">Active Agents</div>
    <table id="agents-table">
      <thead><tr>
        <th>Agent</th><th>Project</th><th>Current Work</th>
        <th>Status</th><th>Items</th><th>Last Seen</th>
      </tr></thead>
      <tbody></tbody>
    </table>
  </div>

  <div class="section">
    <div class="section-title">Work Items</div>
    <table id="work-table">
      <thead><tr>
        <th>Priority</th><th>Title</th><th>Project</th>
        <th>Status</th><th>Claimed By</th><th>Age</th>
      </tr></thead>
      <tbody></tbody>
    </table>
  </div>

  <div class="section">
    <div class="section-title">Event Timeline</div>
    <table id="events-table">
      <thead><tr>
        <th>Time</th><th>Event</th><th>Summary</th>
      </tr></thead>
      <tbody></tbody>
    </table>
  </div>

  <div class="updated" id="last-updated"></div>

  <script>
    const API = '';
    let eventSource = null;

    async function fetchJSON(path) {
      const res = await fetch(API + path);
      return res.json();
    }

    function timeAgo(iso) {
      const diff = Date.now() - new Date(iso).getTime();
      if (diff < 60000) return Math.floor(diff/1000) + 's ago';
      if (diff < 3600000) return Math.floor(diff/60000) + 'm ago';
      if (diff < 86400000) return Math.floor(diff/3600000) + 'h ago';
      return Math.floor(diff/86400000) + 'd ago';
    }

    function timeShort(iso) {
      return new Date(iso).toLocaleTimeString('en', {hour:'2-digit',minute:'2-digit',second:'2-digit'});
    }

    function renderSummary(status) {
      const cards = document.getElementById('summary-cards');
      const agentMap = Object.fromEntries((status.agents || []).map(a => [a.status, a.count]));
      const workMap = Object.fromEntries((status.work || []).map(w => [w.status, w.count]));
      cards.innerHTML = `
        <div class="card"><div class="card-label">Active Agents</div><div class="card-value status-active">${agentMap.active || 0}</div></div>
        <div class="card"><div class="card-label">Stale Agents</div><div class="card-value status-stale">${agentMap.stale || 0}</div></div>
        <div class="card"><div class="card-label">Claimed Items</div><div class="card-value status-claimed">${workMap.claimed || 0}</div></div>
        <div class="card"><div class="card-label">Available Items</div><div class="card-value status-available">${workMap.available || 0}</div></div>
        <div class="card"><div class="card-label">Blocked Items</div><div class="card-value status-blocked">${workMap.blocked || 0}</div></div>
        <div class="card"><div class="card-label">Projects</div><div class="card-value">${status.projects?.count || 0}</div></div>
      `;
    }

    function renderAgents(agents) {
      const tbody = document.querySelector('#agents-table tbody');
      tbody.innerHTML = agents.map(a => {
        const isDelegate = !!a.parent_id;
        const nameClass = isDelegate ? 'delegate-indent' : '';
        const marker = isDelegate ? '<span class="delegate-marker">|_ </span>' : '';
        return `<tr>
          <td class="${nameClass}">${marker}${a.agent_name}</td>
          <td>${a.project || '--'}</td>
          <td>${a.current_work || '--'}</td>
          <td class="status-${a.status}">${a.status}</td>
          <td>${a.claimed_items}</td>
          <td>${timeAgo(a.last_seen_at)}</td>
        </tr>`;
      }).join('');
    }

    function renderWork(items) {
      const tbody = document.querySelector('#work-table tbody');
      tbody.innerHTML = items.map(w => `<tr>
        <td class="priority-${w.priority}">${w.priority}</td>
        <td>${w.title}</td>
        <td>${w.project_id || '--'}</td>
        <td class="status-${w.status}">${w.status}</td>
        <td>${w.claimed_by_name || '--'}</td>
        <td>${timeAgo(w.created_at)}</td>
      </tr>`).join('');
    }

    function renderEvents(events) {
      const tbody = document.querySelector('#events-table tbody');
      tbody.innerHTML = events.slice(0, 50).map(e => `<tr class="event-row">
        <td class="event-time">${timeShort(e.timestamp)}</td>
        <td><span class="event-type">${e.event_type}</span></td>
        <td>${e.summary}</td>
      </tr>`).join('');
    }

    async function refresh() {
      try {
        const [status, agents, work, events] = await Promise.all([
          fetchJSON('/api/status'),
          fetchJSON('/api/agents'),
          fetchJSON('/api/work'),
          fetchJSON('/api/events?since=24h'),
        ]);
        renderSummary(status);
        renderAgents(agents);
        renderWork(work);
        renderEvents(events);
        document.getElementById('last-updated').textContent =
          'Updated ' + new Date().toLocaleTimeString();
      } catch (err) {
        console.error('Refresh failed:', err);
      }
    }

    function connectSSE() {
      if (eventSource) eventSource.close();
      eventSource = new EventSource('/api/events/stream');
      eventSource.onmessage = () => refresh();
      eventSource.onerror = () => {
        eventSource.close();
        setTimeout(connectSSE, 5000);
      };
    }

    // Initial load + SSE for live updates + polling fallback
    refresh();
    connectSSE();
    setInterval(refresh, 15000); // fallback polling every 15s
  </script>
</body>
</html>
```

### What the dashboard shows

| Section | Content | Update frequency |
|---------|---------|-----------------|
| Summary cards | Agent count by status, work item count by status, project count | Real-time via SSE |
| Active Agents | Name, project, current work, status, claimed items, last seen | Real-time via SSE |
| Work Items | Priority, title, project, status, claimed by, age | Real-time via SSE |
| Event Timeline | Last 50 events with timestamp, type, and summary | Real-time via SSE |

---

## 6. Stale Agent Detection

### Detection mechanism

Stale detection is passive -- it runs as a side effect of any `blackboard` command, not as a background daemon. Every CLI invocation includes a sweep step that checks for stale agents and releases their locks.

```typescript
// Stale detection algorithm (runs on every CLI invocation)

interface StaleConfig {
  heartbeatInterval: number;  // default: 60 seconds
  staleThreshold: number;     // default: 300 seconds (5 minutes)
  pruneAfter: number;         // default: 7 days (heartbeat records)
}

const DEFAULT_CONFIG: StaleConfig = {
  heartbeatInterval: 60,
  staleThreshold: 300,
  pruneAfter: 7 * 24 * 3600,
};

function sweepStaleAgents(db: Database, config: StaleConfig): SweepResult {
  const now = new Date().toISOString();
  const threshold = new Date(
    Date.now() - config.staleThreshold * 1000
  ).toISOString();

  // Step 1: Find agents whose last_seen_at exceeds the stale threshold
  const candidates = db.query(`
    SELECT session_id, agent_name, pid, last_seen_at
    FROM agents
    WHERE status = 'active'
      AND last_seen_at < ?
  `).all(threshold);

  const results: SweepResult = {
    markedStale: [],
    locksReleased: [],
    pidsVerified: [],
  };

  for (const agent of candidates) {
    // Step 2: Verify PID is actually dead (defense against clock skew)
    const pidAlive = isPidAlive((agent as any).pid);

    if (pidAlive) {
      // PID still running -- update last_seen_at and continue
      // (agent is alive but missed heartbeats, perhaps under heavy load)
      db.query(`
        UPDATE agents SET last_seen_at = ? WHERE session_id = ?
      `).run(now, (agent as any).session_id);
      results.pidsVerified.push((agent as any).session_id);
      continue;
    }

    // Step 3: Mark agent as stale (atomic transaction)
    db.transaction(() => {
      // Mark agent stale
      db.query(`
        UPDATE agents SET status = 'stale' WHERE session_id = ?
      `).run((agent as any).session_id);

      // Release all work items claimed by this agent
      const released = db.query(`
        UPDATE work_items
        SET status = 'available', claimed_by = NULL, claimed_at = NULL
        WHERE claimed_by = ? AND status = 'claimed'
        RETURNING item_id, title
      `).all((agent as any).session_id);

      // Log events
      db.query(`
        INSERT INTO events (timestamp, event_type, actor_id, target_id, target_type, summary)
        VALUES (?, 'agent_stale', NULL, ?, 'agent', ?)
      `).run(now, (agent as any).session_id,
        `Agent "${(agent as any).agent_name}" marked stale (no heartbeat since ${(agent as any).last_seen_at}, PID ${(agent as any).pid} not found)`
      );

      if (released.length > 0) {
        db.query(`
          INSERT INTO events (timestamp, event_type, actor_id, target_id, target_type, summary)
          VALUES (?, 'stale_locks_released', NULL, ?, 'agent', ?)
        `).run(now, (agent as any).session_id,
          `Released ${released.length} work item(s) from stale agent "${(agent as any).agent_name}": ${released.map((r: any) => r.title).join(", ")}`
        );
      }

      results.markedStale.push((agent as any).session_id);
      results.locksReleased.push(...released.map((r: any) => r.item_id));
    })();
  }

  // Step 4: Prune old heartbeat records
  const pruneThreshold = new Date(
    Date.now() - config.pruneAfter * 1000
  ).toISOString();
  db.query(`DELETE FROM heartbeats WHERE timestamp < ?`).run(pruneThreshold);

  return results;
}

function isPidAlive(pid: number | null): boolean {
  if (pid === null) return false;
  try {
    // On Unix, kill(pid, 0) checks if process exists without sending a signal
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
```

### Configuration

Stale detection parameters are configurable via environment variables or a config file:

```bash
# Environment variables
export BLACKBOARD_HEARTBEAT_INTERVAL=60      # seconds between heartbeats
export BLACKBOARD_STALE_THRESHOLD=300        # seconds before marking stale
export BLACKBOARD_PRUNE_AFTER=604800         # seconds (7 days) before pruning heartbeats

# Or in ~/.pai/blackboard/config.json
{
  "heartbeatInterval": 60,
  "staleThreshold": 300,
  "pruneAfter": 604800
}
```

### How `blackboard observe` reports stale agents

When an agent runs `blackboard observe`, stale events appear in the timeline with actionable context:

```
15:26:00  agent_stale          Agent "Ivy (delegate)" marked stale
                               (no heartbeat since 15:20:00, PID 42890 not found)
15:26:00  stale_locks_released Released 1 item from stale agent "Ivy (delegate)":
                               "Run pai-secret-scanning test suite"
```

The observing agent can then decide whether to pick up the released work item, based on its own judgment and context (PAI Principle 14).

### Race condition handling

The atomic claim operation prevents two agents from claiming the same released item:

```sql
-- Atomic claim: only succeeds if item is still available
UPDATE work_items
SET status = 'claimed',
    claimed_by = :session_id,
    claimed_at = :now
WHERE item_id = :item_id
  AND status = 'available'
  AND claimed_by IS NULL;

-- Check if claim succeeded (rows affected = 1)
-- If 0 rows affected, another agent claimed it first
```

SQLite's serialized write transactions guarantee that exactly one agent wins the claim. The losing agent sees 0 rows affected and can try a different item.

---

## 7. Integration Points

### Spoke layer integration

The local blackboard feeds into the spoke layer (`blackboard status` in the collab-bundle). When generating `.collab/status.yaml`, the CLI enriches the snapshot with local agent activity:

```yaml
# .collab/status.yaml (generated by `blackboard status --export`)
schemaVersion: "1.0"
generatedAt: "2026-02-03T16:00:00Z"

project:
  name: "pai-collab"
  phase: "building"

# Enriched from local blackboard (when available)
agentActivity:
  activeAgents: 2
  lastActivity: "2026-02-03T15:58:00Z"
  currentWork:
    - agent: "Ivy"
      task: "Designing local blackboard architecture"
      project: "pai-collab"
    - agent: "Ivy (delegate)"
      task: "Running test suite"
      project: "pai-secret-scanning"

recentProgress:
  - "SQL schema designed with 5 tables and WAL mode"
  - "CLI command structure defined for 6 primitives"
  - "Web dashboard implemented with SSE live updates"

# Standard spoke fields (from git, tests, specflow)
git:
  branch: "main"
  lastCommit: "abc1234"
  uncommittedChanges: false
tests:
  passing: 380
  failing: 0
  coverage: "87%"
```

The spoke layer does NOT require a local blackboard. Without one, `status.yaml` is generated from git state, test results, and specflow data. The local blackboard is an additive enrichment -- it makes the spoke report richer, not dependent.

### Hub layer aggregation

The hub reads spoke status files via `blackboard pull`. Agent activity from local blackboards surfaces at the hub level as part of the spoke report:

```
$ blackboard pull

SPOKE                   PHASE        AGENTS  LAST ACTIVITY     STATUS
jcfischer/pai-collab    building     2       3m ago            2 items claimed
mellanon/pai             contrib-prep 1       12m ago           signal review
steffen025/opencode      building     0       2h ago            no agent data
```

The hub aggregates but does not store local blackboard data. The spoke is the boundary -- whatever the spoke exposes in `status.yaml` is what the hub sees. The hub never reaches past the spoke into the local layer.

### collab-bundle CLI extension

The `blackboard` tool is the CLI for all three layers. Local operations are the default scope; spoke and hub operations require explicit flags:

```bash
# Local operations (default)
blackboard agent list              # local agents
blackboard work claim ...          # local work items
blackboard observe                 # local events
blackboard serve                   # local dashboard

# Spoke operations
blackboard status --export         # generate .collab/status.yaml
blackboard status                  # read local + generate report

# Hub operations
blackboard pull                    # aggregate from registered spokes
blackboard registry                # show all spokes and health
```

The `blackboard` binary ships as part of the collab-bundle but is independently usable. An operator without the collab-bundle can still use the local layer for agent coordination within their own machine.

### Relationship to existing tooling

```
blackboard CLI
|
+-- Local layer (this proposal)
|   +-- SQLite: ~/.pai/blackboard/local.db
|   +-- Web: blackboard serve (http://127.0.0.1:3141)
|   +-- Hooks: PAI hooks for auto-register/heartbeat/deregister
|
+-- Spoke layer (#80, collab-bundle)
|   +-- .collab/manifest.yaml (identity)
|   +-- .collab/status.yaml (snapshot, enriched by local)
|
+-- Hub layer (#80, pai-collab repo)
    +-- GitHub Issues/PRs (canonical work queue)
    +-- REGISTRY.md (project/agent index)
    +-- blackboard pull (aggregation)
```

---

## 8. Security Considerations

### File permissions

```bash
# Database file: owner read/write only
chmod 600 ~/.pai/blackboard/local.db
chmod 600 ~/.pai/blackboard/local.db-wal
chmod 600 ~/.pai/blackboard/local.db-shm

# Directory: owner access only
chmod 700 ~/.pai/blackboard/

# Per-project blackboard
chmod 600 .blackboard/local.db
chmod 700 .blackboard/
```

The `blackboard` CLI enforces these permissions on database creation and refuses to open a database with world-readable or group-readable permissions.

### Network exposure

The web server binds exclusively to `127.0.0.1`. The code explicitly sets `hostname: "127.0.0.1"` -- never `0.0.0.0` or `::`. There is no configuration option to change this. If an operator needs remote access, they must set up an SSH tunnel explicitly. The blackboard does not provide that capability.

No authentication is implemented because the threat model does not require it for localhost-only access. Any process running as the operator's user can already read the SQLite file directly.

### Agent identity

Agent identity is session-scoped and local-only. No cryptographic identity is needed because:

1. All agents run as the same OS user on the same machine
2. The threat model is coordination (preventing duplication), not authorization (preventing unauthorized access)
3. Session IDs are UUID v4 -- unique but not secret
4. PID verification provides liveness checking, not authentication

Agent identity consists of: `session_id` (UUID) + `pid` (OS process ID) + `agent_name` (display name). This is sufficient for the coordination use case. If the blackboard were ever exposed over a network (which this design explicitly prohibits), identity would need to be revisited.

### Content filtering on writes

The `summary` and `current_work` fields are free-text written by agents. These fields are potential prompt injection vectors -- a compromised agent could write content designed to manipulate other agents that read the blackboard.

Mitigation:

```typescript
// Content filtering on all text fields written to the blackboard
function sanitizeBlackboardText(input: string): string {
  // Strip common prompt injection patterns
  const stripped = input
    .replace(/```[\s\S]*?```/g, "[code block removed]")  // code blocks
    .replace(/<[^>]+>/g, "")                               // HTML tags
    .replace(/\{[^}]+\}/g, "")                             // template literals
    .slice(0, 500);                                        // length limit

  return stripped;
}
```

This is defense in depth -- the primary protection is that only local agents (running as the operator's user) can write to the database.

### What the blackboard does NOT store

The blackboard explicitly excludes:

| Category | Examples | Where it belongs |
|----------|----------|-----------------|
| Credentials | API keys, tokens, passwords | `.env`, keychain, secrets manager |
| Token quota | Remaining budget, rate limits | PAI runtime (at the API call site) |
| Conversation content | User messages, agent responses | Claude Code session storage |
| Personal data | User identity, preferences | PAI `settings.json` |
| File contents | Source code, documents | The file system and git |

The blackboard stores only coordination metadata: who is doing what, what is claimed, what happened. It is a ledger, not a vault.

### Attack surface summary

| Vector | Risk | Mitigation |
|--------|------|-----------|
| Malicious process writes to DB | Low (requires same-user access) | File permissions (0600), process isolation |
| Prompt injection via progress log | Medium (agents read each other's summaries) | Content filtering on write, length limits |
| Stale PID reuse (OS reassigns PID) | Low (race window is small) | UUID session_id as primary key, PID is secondary check |
| DoS via event table growth | Low (local only) | Automatic pruning of old records, size monitoring |
| Web server exploitation | Low (localhost only, read-only) | 127.0.0.1 binding, no write endpoints, no auth needed |

---

## Appendix A: Atomic Operations

The six primitives map to SQLite transactions. Each operation is atomic -- it either fully succeeds or fully rolls back.

### REGISTER (agent joins)

```sql
BEGIN TRANSACTION;

INSERT INTO agents (session_id, agent_name, pid, parent_id, project, current_work, status, started_at, last_seen_at)
VALUES (:session_id, :agent_name, :pid, :parent_id, :project, :current_work, 'active', :now, :now);

INSERT INTO events (timestamp, event_type, actor_id, target_id, target_type, summary)
VALUES (:now, 'agent_registered', :session_id, :session_id, 'agent',
        'Agent "' || :agent_name || '" registered on project "' || COALESCE(:project, 'none') || '"');

COMMIT;
```

### CLAIM (agent takes a work item)

```sql
BEGIN TRANSACTION;

-- Atomic: only succeeds if status is still 'available'
UPDATE work_items
SET status = 'claimed', claimed_by = :session_id, claimed_at = :now
WHERE item_id = :item_id AND status = 'available';

-- Verify exactly 1 row was updated (claim succeeded)
-- If 0 rows: item was already claimed by another agent

INSERT INTO events (timestamp, event_type, actor_id, target_id, target_type, summary)
VALUES (:now, 'work_claimed', :session_id, :item_id, 'work_item',
        'Agent "' || :agent_name || '" claimed "' || :title || '"');

COMMIT;
```

### RELEASE (agent gives up a claim)

```sql
BEGIN TRANSACTION;

UPDATE work_items
SET status = 'available', claimed_by = NULL, claimed_at = NULL
WHERE item_id = :item_id AND claimed_by = :session_id;

INSERT INTO events (timestamp, event_type, actor_id, target_id, target_type, summary)
VALUES (:now, 'work_released', :session_id, :item_id, 'work_item',
        'Agent "' || :agent_name || '" released "' || :title || '"');

COMMIT;
```

### HEARTBEAT (agent confirms liveness)

```sql
BEGIN TRANSACTION;

UPDATE agents SET last_seen_at = :now WHERE session_id = :session_id;

INSERT INTO heartbeats (session_id, timestamp, progress, work_item_id)
VALUES (:session_id, :now, :progress, :work_item_id);

-- Heartbeat events are logged only if progress is provided (avoid event spam)
-- INSERT INTO events ... only if :progress IS NOT NULL

COMMIT;
```

### OBSERVE (agent checks what changed)

```sql
-- Read-only: no transaction needed (WAL mode handles concurrent reads)
SELECT id, timestamp, event_type, actor_id, target_id, target_type, summary
FROM events
WHERE timestamp > :since
ORDER BY timestamp ASC;
```

---

## Appendix B: Implementation Roadmap

### Phase 1: Core (MVP)

Build the minimum viable local blackboard.

- [P] SQLite schema creation and migration
- [P] `blackboard agent register` / `deregister` / `list`
- [P] `blackboard agent heartbeat`
- [ ] Stale detection sweep (runs on every command)
- [ ] `blackboard status` (overall health)
- [P] `--json` output for all commands

Acceptance criteria: Two Claude Code sessions can see each other via `blackboard agent list`.

### Phase 2: Work Tracking

Add the claiming primitive.

- [P] `blackboard work claim` / `release` / `complete` / `list` / `status`
- [P] `blackboard project register` / `list` / `status`
- [ ] `blackboard observe` (event log)
- [ ] Atomic claim transactions (SQLite)

Acceptance criteria: An agent can claim a work item and another agent sees it as claimed.

### Phase 3: Integration

Connect to PAI hooks and the spoke layer.

- [P] PAI hook: auto-register on session start
- [P] PAI hook: heartbeat on tool use
- [P] PAI hook: deregister on session end
- [ ] Task tool delegate registration
- [ ] `blackboard status --export` (enriches .collab/status.yaml)

Acceptance criteria: Agent registration and heartbeat happen without manual CLI invocation.

### Phase 4: Visibility

Build the web dashboard.

- [ ] `blackboard serve` (Bun HTTP server)
- [ ] Dashboard HTML (single page, no build step)
- [ ] SSE endpoint for live updates
- [ ] API endpoints (status, agents, work, events)

Acceptance criteria: Operator can view all active agents and work items in a browser.

[P] marks tasks that can be parallelized within the phase.

---

## Appendix C: Configuration Reference

```json
// ~/.pai/blackboard/config.json
{
  "schemaVersion": 1,

  "database": {
    "operatorPath": "~/.pai/blackboard/local.db",
    "projectDir": ".blackboard"
  },

  "heartbeat": {
    "intervalSeconds": 60,
    "staleThresholdSeconds": 300
  },

  "sweep": {
    "pruneHeartbeatsAfterDays": 7,
    "pruneEventsAfterDays": 30,
    "pruneCompletedAgentsAfterDays": 1
  },

  "webServer": {
    "port": 3141,
    "host": "127.0.0.1"
  },

  "contentFilter": {
    "maxFieldLength": 500,
    "stripCodeBlocks": true,
    "stripHtmlTags": true
  }
}
```

---

## Appendix D: Comparison with Prior Proposals

This architecture incorporates learnings from the council debate, PAI Founding Principles analysis, and community feedback on issue #78.

| Aspect | Original proposal (#78) | This architecture |
|--------|------------------------|-------------------|
| Storage | YAML files (agents.yaml, tasks.yaml, progress.yaml, quota.yaml) | SQLite with WAL mode (single file, ACID transactions) |
| Token quota | In-blackboard (quota.yaml) | Removed -- belongs in PAI runtime |
| Agent model | Job-shop (task queue, interchangeable workers) | Awareness model (agents see each other, decide independently) |
| Task assignment | Claiming protocol assigns work | Agents claim voluntarily based on context and judgment |
| Security | "Questions for discussion" | Designed in: permissions, content filtering, no external input |
| Heartbeat | Timer-based daemon | Piggybacks on tool use hooks, PID verification for crash detection |
| Web visibility | Not proposed | Lightweight Bun server, single HTML page, SSE updates |
| Spoke integration | Not addressed | `--export` flag enriches .collab/status.yaml |
| Stale detection | Timer-based with race conditions | PID verification + atomic SQLite transactions |

### What was kept from the original

- The problem statement (agents are blind to each other)
- The layering model (local / spoke / hub)
- The six primitives (REGISTER, QUERY, CLAIM, RELEASE, HEARTBEAT, OBSERVE)
- CLI as the primary interface
- Dual location (operator-wide + per-project)

### What was changed based on feedback

- YAML replaced with SQLite (council unanimous, PAI Principle 5)
- Token quota removed from blackboard (council unanimous)
- Job-shop model replaced with awareness model (PAI Principle 14)
- Security designed in, not deferred (council security agent)
- Heartbeat daemon replaced with hook-based approach (PAI Principle 6)
- Web dashboard added for operator visibility (requirement from user)

---

*This architecture is proposed as a concrete design for the local layer of the three-layer blackboard model described in issue #80. It is ready for community review and implementation when multi-agent coordination is empirically needed.*
