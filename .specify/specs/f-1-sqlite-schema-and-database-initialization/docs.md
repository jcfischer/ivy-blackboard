# Documentation: F-1 SQLite Schema and Database Initialization

## Files Created

| File | Purpose |
|------|---------|
| `src/types.ts` | Entity interfaces, status/priority/source union types |
| `src/schema.ts` | SQL DDL constants (PRAGMAs, tables, indexes, seed) |
| `src/db.ts` | Database lifecycle: resolveDbPath, openDatabase, migrate, closeDatabase |

## API Reference

### `resolveDbPath(options?, cwd?, home?): string`
Resolves database path using 4-level chain: `--db` > `$BLACKBOARD_DB` > `.blackboard/local.db` > `~/.pai/blackboard/local.db`.

### `openDatabase(path): Database`
Opens SQLite database, sets PRAGMAs (WAL, FK, busy_timeout), creates schema if fresh, runs migrations if needed.

### `closeDatabase(db): void`
Closes database handle cleanly.

### `getSchemaVersion(db): number`
Returns current schema version from database.

### `migrate(db): void`
Runs pending migrations in version order.

## Schema
6 tables: agents, projects, work_items, heartbeats, events, schema_version. See `app-context.md` Section 2 for full DDL.
