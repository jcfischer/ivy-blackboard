---
feature: "SQLite schema and database initialization"
spec: "./spec.md"
status: "draft"
---

# Technical Plan: SQLite Schema and Database Initialization

## Architecture Overview

A single `db.ts` module that owns database lifecycle: path resolution, creation, PRAGMA configuration, schema creation, and migration. All other features import `openDatabase()` and receive an initialized handle.

```
CLI invocation
    |
    v
resolveDbPath(options)          # --db > $BLACKBOARD_DB > .blackboard/ > ~/.pai/
    |
    v
openDatabase(path)
    |
    ├─ PRAGMAs (WAL, FK, busy_timeout)
    ├─ createSchema() if fresh
    └─ migrate() if version < current
    |
    v
Database handle → command handler
```

## Technology Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Language | TypeScript | PAI standard |
| Runtime | Bun | PAI standard, native `bun:sqlite` |
| Database | SQLite via `bun:sqlite` | No external dependency, ACID, WAL for concurrent reads |
| Validation | Zod | Input validation for migration metadata |

## Constitutional Compliance

- [x] **CLI-First:** Database is created/opened by CLI commands, no separate setup step
- [x] **Library-First:** `db.ts` is a pure library module — no CLI coupling
- [x] **Test-First:** Unit tests for resolution chain, schema creation, PRAGMA verification
- [x] **Deterministic:** Schema is DDL — identical output every time
- [x] **Code Before Prompts:** Entire schema defined in TypeScript/SQL, no AI generation

## Data Model

### TypeScript interfaces

```typescript
interface DbOptions {
  dbPath?: string;       // --db flag
  envPath?: string;      // $BLACKBOARD_DB
}

interface MigrationEntry {
  version: number;
  applied_at: string;    // ISO 8601
  description: string;
}
```

### Database Schema

Six tables defined in the architecture doc (Section 2). The SQL is verbatim from `app-context.md`:

- `agents` — agent sessions with status, PID, parent linkage
- `projects` — registered projects with local path and remote repo
- `work_items` — claimable work units with priority and status
- `heartbeats` — append-only liveness log
- `events` — append-only event log (14 event types)
- `schema_version` — migration tracking

All CHECK constraints, indexes, and foreign keys as specified.

## API Contracts

### Internal APIs

```typescript
// Resolve database path from options + env + filesystem
function resolveDbPath(options?: DbOptions): string;

// Open (and create if needed) the database with PRAGMAs and schema
function openDatabase(path: string): Database;

// Run pending migrations (idempotent)
function migrate(db: Database): void;

// Get current schema version
function getSchemaVersion(db: Database): number;

// Close database cleanly
function closeDatabase(db: Database): void;

// SQL constants for schema creation
const SCHEMA_SQL: string;
```

## Implementation Strategy

### Phase 1: Path resolution

- [ ] `resolveDbPath()` implementing 4-level chain
- [ ] Auto-create `~/.pai/blackboard/` and `.blackboard/` directories
- [ ] Unit tests for each resolution path

### Phase 2: Schema creation

- [ ] SQL string constant with all 6 CREATE TABLE statements
- [ ] SQL string constant with all CREATE INDEX statements
- [ ] `createSchema(db)` executing DDL in a transaction
- [ ] Initial `schema_version` insert (version 1)

### Phase 3: Database open

- [ ] `openDatabase(path)` setting PRAGMAs
- [ ] Schema creation on fresh database
- [ ] Migration check on existing database
- [ ] Error handling for corrupt/inaccessible databases

## File Structure

```
src/
├── db.ts               # [New] Database lifecycle: open, create, migrate
├── schema.ts           # [New] SQL DDL constants and table definitions
├── types.ts            # [New] Shared TypeScript interfaces

tests/
├── db.test.ts          # [New] resolveDbPath, openDatabase, migrate
├── schema.test.ts      # [New] Table creation, constraints, indexes
```

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| bun:sqlite WAL behavior differs from standard SQLite | High | Low | Test PRAGMA on CI, verify WAL files created |
| Directory creation race (two agents start simultaneously) | Low | Low | `mkdirSync({ recursive: true })` is atomic |
| Schema version drift (code has v2, DB has v1, no migration written) | Medium | Medium | Migration test asserts version matches code constant |

## Failure Mode Analysis

### How This Code Can Fail

| Failure Mode | Trigger | Detection | Degradation | Recovery |
|-------------|---------|-----------|-------------|----------|
| Directory not writable | Permissions, disk full | `mkdirSync` throws | CLI exits with error message | User fixes permissions |
| Database corrupt | Crash during write | `PRAGMA integrity_check` | Refuse to open, log path | User deletes and recreates |
| WAL mode not supported | Unusual SQLite build | PRAGMA returns non-wal | Fall back to DELETE journal | Log warning |
| Schema version > code version | Downgraded CLI | Version check | Refuse to open (data safety) | User upgrades CLI |

### Blast Radius

- **Files touched:** ~4 new files
- **Systems affected:** None yet (foundation feature)
- **Rollback strategy:** Delete database file, re-run

## Dependencies

### External

- `bun:sqlite` (Bun built-in) — SQLite driver
- `node:fs` (Bun built-in) — directory creation, path resolution
- `node:path` (Bun built-in) — path joining
- `node:os` (Bun built-in) — home directory resolution

### Internal

- None (this is the foundation)

## Migration/Deployment

- [ ] No database migrations needed (this creates v1)
- [ ] No environment variables required (optional `$BLACKBOARD_DB`)
- [ ] No breaking changes (greenfield)

## Estimated Complexity

- **New files:** ~4
- **Modified files:** 0
- **Test files:** ~2
- **Estimated tasks:** ~5
- **Debt score:** 1 (clean greenfield)

## Longevity Assessment

### Maintainability Indicators

| Indicator | Status | Notes |
|-----------|--------|-------|
| **Readability:** Can a developer understand this in 6 months? | Yes | SQL DDL is self-documenting |
| **Testability:** Can changes be verified without manual testing? | Yes | Unit tests for all paths |
| **Documentation:** Is the "why" captured, not just the "what"? | Yes | Architecture doc explains all decisions |

### Evolution Vectors

| What Might Change | Preparation | Impact |
|------------------|-------------|--------|
| New tables needed | Migration pattern ready | Low |
| Column changes | ALTER TABLE in migration | Medium |
| Index tuning | Can add/drop indexes without data loss | Low |
| Switch from bun:sqlite | Abstract behind Database interface | Medium |

### Deletion Criteria

- [ ] Feature superseded by: external coordination service
- [ ] Dependency deprecated: bun:sqlite removed from Bun
- [ ] User need eliminated: multi-agent coordination no longer needed
- [ ] Maintenance cost exceeds value when: schema becomes unmaintainable
