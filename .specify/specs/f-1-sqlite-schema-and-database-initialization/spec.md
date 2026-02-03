---
id: "F-1"
feature: "SQLite schema and database initialization"
status: "draft"
created: "2026-02-03"
---

# Specification: SQLite Schema and Database Initialization

## Overview

The local blackboard needs a SQLite database as its coordination surface. This feature creates the database with WAL mode, defines 6 tables (agents, projects, work_items, heartbeats, events, schema_version), creates indexes for query performance, and implements dual-location resolution so the database can live per-project (`.blackboard/local.db`) or operator-wide (`~/.pai/blackboard/local.db`).

This is the foundation — every other feature depends on a correctly initialized database.

## User Scenarios

### Scenario 1: First-time database creation

**As a** PAI operator
**I want to** have the database auto-created when I first run a blackboard command
**So that** I don't need manual setup steps

**Acceptance Criteria:**
- [ ] Running any blackboard command in a directory without a database creates one automatically
- [ ] Created database has all 6 tables with correct schemas
- [ ] WAL mode is enabled (journal_mode = WAL)
- [ ] Foreign keys are enforced (foreign_keys = ON)
- [ ] Busy timeout is set (busy_timeout = 5000)
- [ ] schema_version table has version 1 recorded

### Scenario 2: Dual-location resolution

**As a** PAI operator running multiple projects
**I want to** have per-project databases that are separate from my operator-wide database
**So that** project-specific agents don't pollute the global view

**Acceptance Criteria:**
- [ ] If `.blackboard/` directory exists in cwd, use `.blackboard/local.db`
- [ ] If no `.blackboard/` exists, fall back to `~/.pai/blackboard/local.db`
- [ ] `$BLACKBOARD_DB` environment variable overrides both
- [ ] `--db <path>` flag overrides everything
- [ ] Operator-wide directory (`~/.pai/blackboard/`) is created if it doesn't exist

### Scenario 3: Existing database reuse

**As a** PAI operator restarting my machine
**I want to** retain my blackboard state across restarts
**So that** historical data (completed agents, events) persists

**Acceptance Criteria:**
- [ ] Opening an existing database does not recreate tables
- [ ] Schema version is checked on open
- [ ] If schema version is current, no migration runs
- [ ] If schema version is lower, migrations run in order

## Functional Requirements

### FR-1: Database initialization with PRAGMAs

Initialize the SQLite database with WAL mode, foreign key enforcement, and busy timeout. These PRAGMAs must be set on every connection open, not just on creation.

**Validation:** Open database, query `PRAGMA journal_mode` returns `wal`, `PRAGMA foreign_keys` returns `1`, `PRAGMA busy_timeout` returns `5000`.

### FR-2: Table creation — agents

Create the `agents` table with columns: session_id (TEXT PK), agent_name (TEXT NOT NULL), pid (INTEGER), parent_id (TEXT FK self-ref), project (TEXT), current_work (TEXT), status (TEXT CHECK IN active/idle/completed/stale), started_at (TEXT NOT NULL), last_seen_at (TEXT NOT NULL), metadata (TEXT JSON).

Indexes: status, project, parent_id, last_seen_at.

**Validation:** Insert a row with all fields, query it back, verify FK constraint on parent_id.

### FR-3: Table creation — projects

Create the `projects` table with columns: project_id (TEXT PK), display_name (TEXT NOT NULL), local_path (TEXT), remote_repo (TEXT), registered_at (TEXT NOT NULL), metadata (TEXT JSON).

**Validation:** Insert and query a project row.

### FR-4: Table creation — work_items

Create the `work_items` table with columns: item_id (TEXT PK), project_id (TEXT FK), title (TEXT NOT NULL), description (TEXT), source (TEXT CHECK IN github/local/operator), source_ref (TEXT), status (TEXT CHECK IN available/claimed/completed/blocked), priority (TEXT CHECK IN P1/P2/P3 DEFAULT P2), claimed_by (TEXT FK agents), claimed_at (TEXT), completed_at (TEXT), blocked_by (TEXT), created_at (TEXT NOT NULL), metadata (TEXT JSON).

Indexes: status, project_id, claimed_by, (priority + status).

**Validation:** Insert work item, verify FK to projects and agents, verify CHECK constraints reject invalid values.

### FR-5: Table creation — heartbeats

Create the `heartbeats` table with columns: id (INTEGER PK AUTOINCREMENT), session_id (TEXT FK NOT NULL), timestamp (TEXT NOT NULL), progress (TEXT), work_item_id (TEXT FK).

Indexes: (session_id + timestamp), timestamp.

**Validation:** Insert heartbeat rows, verify FK constraints.

### FR-6: Table creation — events

Create the `events` table with columns: id (INTEGER PK AUTOINCREMENT), timestamp (TEXT NOT NULL), event_type (TEXT CHECK IN 14 valid types), actor_id (TEXT), target_id (TEXT), target_type (TEXT CHECK IN agent/work_item/project), summary (TEXT NOT NULL), metadata (TEXT JSON).

Indexes: timestamp, event_type, actor_id.

**Validation:** Insert events with each valid event_type, verify CHECK constraint rejects invalid types.

### FR-7: Schema version tracking

Create `schema_version` table. Insert version 1 on first creation. Provide a migration mechanism that checks current version and applies sequential migrations.

**Validation:** Fresh DB has version 1. Calling migrate on version 1 DB is a no-op. Future migrations increment version.

### FR-8: Database resolution function

Export a `resolveDbPath()` function that implements the resolution chain: `--db` flag > `$BLACKBOARD_DB` env > `.blackboard/local.db` (if exists) > `~/.pai/blackboard/local.db`.

**Validation:** Unit test each resolution path with mocked env/fs.

## Non-Functional Requirements

- **Performance:** Database creation under 100ms. Table queries sub-millisecond for <1000 rows.
- **Security:** File permissions handled by F-15 (separate feature). No network exposure.
- **Scalability:** Schema supports thousands of events and hundreds of agents without index pressure.
- **Failure Behavior:**
  - On database directory not writable: Error with clear message about path and permissions
  - On corrupt database: Error message; do not silently recreate (data loss risk)
  - On schema version mismatch (future > current): Error; CLI is outdated
  - On unknown error: Log error, exit with non-zero code

## Key Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| agents | Agent sessions (active, completed, stale) | session_id, agent_name, pid, status, last_seen_at |
| projects | Registered projects | project_id, display_name, local_path, remote_repo |
| work_items | Claimable work units | item_id, title, status, priority, claimed_by |
| heartbeats | Append-only liveness log | session_id, timestamp, progress |
| events | Append-only event log | event_type, actor_id, target_id, summary |
| schema_version | Migration tracking | version, applied_at |

## Success Criteria

- [ ] All 6 tables created with correct columns, types, and constraints
- [ ] WAL mode enabled and verified
- [ ] Foreign key constraints enforced (insert with invalid FK fails)
- [ ] CHECK constraints enforced (insert with invalid status fails)
- [ ] Database resolution picks correct path per priority chain
- [ ] Schema version 1 recorded on fresh creation
- [ ] Opening existing database is idempotent (no duplicate tables)

## Assumptions

| Assumption | What Would Invalidate It | Detection Strategy |
|-----------|-------------------------|-------------------|
| Bun's bun:sqlite supports WAL mode | Bun drops WAL support | Test PRAGMA on CI |
| `~/.pai/` directory is writable | Restricted home directory | Check on init, error clearly |
| SQLite supports all CHECK constraints used | Older SQLite build | Test constraints in unit tests |

## System Context

### Upstream Dependencies

| System | What We Get | What Breaks If It Changes | Version/Contract |
|--------|-------------|---------------------------|------------------|
| Bun runtime | `bun:sqlite` module | Database API changes | Bun 1.x |
| OS filesystem | File I/O for .db files | Path resolution, permissions | POSIX |

### Downstream Consumers

| System | What They Expect | Breaking Change Threshold |
|--------|-----------------|--------------------------|
| F-2 CLI framework | `openDatabase()` returns initialized Database | API signature change |
| F-3 Agent commands | agents table exists with correct schema | Column rename/remove |
| F-7 Project commands | projects table exists | Column rename/remove |
| F-8 Work commands | work_items table exists | Column rename/remove |

### Adjacent Systems (Implicit Coupling)

| System | Implicit Dependency | Risk |
|--------|---------------------|------|
| F-15 File permissions | Shares database path resolution | Must agree on paths |
| F-20 Configuration | May override default paths | Config must load before DB |

## Out of Scope

- File permissions enforcement (F-15)
- Configuration file loading (F-20)
- CLI entry point and command routing (F-2)
- Any read/write operations beyond schema creation
- Database backup or export
- Multi-database federation
