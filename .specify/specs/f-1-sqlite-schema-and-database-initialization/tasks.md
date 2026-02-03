---
feature: "SQLite schema and database initialization"
plan: "./plan.md"
status: "pending"
total_tasks: 6
completed: 0
---

# Tasks: SQLite Schema and Database Initialization

## Legend

- `[T]` - Test required (TDD mandatory - write test FIRST)
- `[P]` - Can run in parallel with other [P] tasks in same group
- `depends: T-X.Y` - Must complete after specified task(s)

## Task Groups

### Group 1: Types and SQL

- [ ] **T-1.1** Define shared TypeScript interfaces [T] [P]
  - File: `src/types.ts`
  - Test: `tests/types.test.ts`
  - Description: Define `DbOptions`, `MigrationEntry`, and all entity interfaces (`BlackboardAgent`, `BlackboardProject`, `BlackboardWorkItem`, `BlackboardEvent`, `BlackboardHeartbeat`). Include status/priority literal union types with CHECK constraint values. Zod schemas for validation where applicable.

- [ ] **T-1.2** Create SQL DDL constants [T] [P]
  - File: `src/schema.ts`
  - Test: `tests/schema.test.ts`
  - Description: Define `PRAGMA_SQL` (WAL, FK, busy_timeout), `CREATE_TABLES_SQL` (all 6 tables with CHECK constraints, FKs), `CREATE_INDEXES_SQL` (all indexes), and `SEED_VERSION_SQL` (insert schema_version 1). Each as a separate constant for testability.

### Group 2: Database Lifecycle

- [ ] **T-2.1** Implement database path resolution [T] (depends: T-1.1)
  - File: `src/db.ts`
  - Test: `tests/db.test.ts`
  - Description: `resolveDbPath(options?: DbOptions): string` implementing the 4-level chain: `--db` flag > `$BLACKBOARD_DB` env > `.blackboard/local.db` (if dir exists) > `~/.pai/blackboard/local.db`. Auto-create `~/.pai/blackboard/` directory if needed. Resolve `~` to `os.homedir()`.

- [ ] **T-2.2** Implement database open and schema creation [T] (depends: T-1.2, T-2.1)
  - File: `src/db.ts`
  - Test: `tests/db.test.ts`
  - Description: `openDatabase(path: string): Database` that opens SQLite, sets PRAGMAs, checks if tables exist (query sqlite_master), creates schema if fresh, verifies schema_version. Returns initialized handle. `closeDatabase(db)` for clean shutdown.

### Group 3: Migration and Verification

- [ ] **T-3.1** Implement migration support [T] (depends: T-2.2)
  - File: `src/db.ts`
  - Test: `tests/db.test.ts`
  - Description: `getSchemaVersion(db): number` and `migrate(db): void`. Migration reads current version, applies any pending migrations in order. Each migration is a function `(db: Database) => void` registered in a version-ordered array. Currently only v1 (no-op, schema created by openDatabase). Future migrations increment version.

- [ ] **T-3.2** Verify all constraints and indexes [T] (depends: T-2.2)
  - File: (no new file — test only)
  - Test: `tests/schema.test.ts`
  - Description: Integration tests that verify: CHECK constraints reject invalid status/priority/source/event_type values, FK constraints reject invalid parent_id/project_id/claimed_by/session_id references, all expected indexes exist (query sqlite_master for index names), PRAGMA values are correct (WAL, FK on, busy_timeout).

## Dependency Graph

```
T-1.1 ──┐
         ├──> T-2.1 ──┐
T-1.2 ──┤             ├──> T-2.2 ──┬──> T-3.1
         └─────────────┘            └──> T-3.2
```

## Execution Order

1. **Parallel batch 1:** T-1.1, T-1.2
2. **Sequential:** T-2.1 (after T-1.1)
3. **Sequential:** T-2.2 (after T-1.2 and T-2.1)
4. **Parallel batch 2:** T-3.1, T-3.2 (after T-2.2)

## Progress Tracking

| Task | Status | Started | Completed | Notes |
|------|--------|---------|-----------|-------|
| T-1.1 | pending | - | - | |
| T-1.2 | pending | - | - | |
| T-2.1 | pending | - | - | |
| T-2.2 | pending | - | - | |
| T-3.1 | pending | - | - | |
| T-3.2 | pending | - | - | |

## TDD Enforcement (MANDATORY)

**CRITICAL:** Every task marked [T] MUST follow the RED-GREEN-BLUE cycle.

### The TDD Cycle

For each task marked [T]:

1. **RED:** Write failing test FIRST
2. **GREEN:** Write MINIMAL implementation to pass
3. **BLUE:** Refactor while keeping tests green
4. **VERIFY:** Run full test suite (`bun test`)

### Test Coverage Requirements

- **Minimum ratio:** 0.3 (test files / source files)
- **Every source file** should have a corresponding test file

## Blockers & Issues

| Task | Issue | Resolution |
|------|-------|------------|
| - | - | - |

## Post-Implementation Verification

### Functional Verification
- [ ] All unit tests pass
- [ ] Schema creates correctly on fresh database
- [ ] Schema is idempotent (opening existing DB doesn't error)
- [ ] Path resolution works for all 4 levels

### Failure Verification (Doctorow Gate)
- [ ] **Failure test:** Non-writable directory produces clear error
- [ ] **Failure test:** Corrupt database produces clear error (not silent recreate)
- [ ] **Failure test:** Schema version > code version produces clear error
- [ ] **Rollback test:** Deleting database file is full rollback

### Maintainability Verification
- [ ] SQL DDL is readable and matches architecture doc
- [ ] TypeScript types match SQL schema exactly
- [ ] No orphan code

### Sign-off
- [ ] All verification items checked
- Date completed: ___
