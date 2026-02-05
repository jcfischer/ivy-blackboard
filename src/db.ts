import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { setSecurePermissions, validatePermissions } from "./permissions";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import {
  PRAGMA_SQL,
  CREATE_TABLES_SQL,
  CREATE_INDEXES_SQL,
  SEED_VERSION_SQL,
  CURRENT_SCHEMA_VERSION,
  MIGRATE_V2_SQL,
  MIGRATE_V3_SQL,
  MIGRATE_V4_SQL,
} from "./schema";
import type { DbOptions } from "./types";
import { loadConfig } from "./config";

/**
 * Resolve the database path using the 4-level chain:
 * 1. --db flag (explicit)
 * 2. $BLACKBOARD_DB env var
 * 3. .blackboard/local.db (per-project, if dir exists)
 * 4. ~/.pai/blackboard/local.db (operator-wide fallback)
 *
 * @param options - CLI options with optional dbPath
 * @param cwd - Current working directory (defaults to process.cwd())
 * @param home - Home directory (defaults to os.homedir())
 */
export function resolveDbPath(
  options?: DbOptions,
  cwd?: string,
  home?: string
): string {
  // Level 1: explicit --db flag
  if (options?.dbPath) {
    return options.dbPath;
  }

  // Level 2: $BLACKBOARD_DB environment variable
  const envPath = options?.envPath ?? process.env.BLACKBOARD_DB;
  if (envPath) {
    return envPath;
  }

  const workDir = cwd ?? process.cwd();
  const config = loadConfig();

  // Level 3: <projectDir>/local.db (per-project)
  const projectDir = join(workDir, config.database.projectDir);
  if (existsSync(projectDir)) {
    return join(projectDir, "local.db");
  }

  // Level 4: operator-wide path from config (~ expanded to home)
  const homeDir = home ?? homedir();
  const operatorPath = config.database.operatorPath.replace(/^~/, homeDir);
  const operatorDir = dirname(operatorPath);
  mkdirSync(operatorDir, { recursive: true });
  return operatorPath;
}

/**
 * Open (and initialize if needed) a blackboard database.
 * Sets PRAGMAs, creates schema on fresh databases, verifies version on existing ones.
 */
export function openDatabase(path: string): Database {
  // Ensure parent directory exists
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });

  const isExisting = existsSync(path);

  // Validate permissions on existing database
  if (isExisting) {
    validatePermissions(path);
  }

  const db = new Database(path, { create: true });

  // Set PRAGMAs (must be set on every connection)
  for (const sql of PRAGMA_SQL) {
    db.exec(sql);
  }

  // Check if schema exists
  const hasSchema = db
    .query(
      "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='schema_version'"
    )
    .get() as { count: number };

  if (hasSchema.count === 0) {
    // Fresh database — create schema
    db.exec(CREATE_TABLES_SQL);
    db.exec(CREATE_INDEXES_SQL);
    db.exec(SEED_VERSION_SQL);
    // Set secure permissions on newly created database
    setSecurePermissions(path);
  } else {
    // Existing database — check version
    const version = getSchemaVersion(db);
    if (version > CURRENT_SCHEMA_VERSION) {
      closeDatabase(db);
      throw new Error(
        `Database schema version ${version} is newer than supported version ${CURRENT_SCHEMA_VERSION}. ` +
          `Please upgrade the blackboard CLI.`
      );
    }
    if (version < CURRENT_SCHEMA_VERSION) {
      migrate(db);
    }
  }

  return db;
}

/**
 * Get the current schema version from the database.
 */
export function getSchemaVersion(db: Database): number {
  const row = db
    .query("SELECT MAX(version) as version FROM schema_version")
    .get() as { version: number } | null;
  return row?.version ?? 0;
}

/**
 * Run pending migrations to bring schema to current version.
 * Each migration is a function registered in version order.
 */
export function migrate(db: Database): void {
  const current = getSchemaVersion(db);

  // Migration registry: version -> migration function
  const migrations: Array<{
    version: number;
    description: string;
    fn: (db: Database) => void;
  }> = [
    {
      version: 2,
      description: "Remove event_type CHECK constraint (free-form event types)",
      fn: (db) => { db.exec(MIGRATE_V2_SQL); },
    },
    {
      version: 3,
      description: "Add metadata column to heartbeats table",
      fn: (db) => { db.exec(MIGRATE_V3_SQL); },
    },
    {
      version: 4,
      description: "Remove source CHECK constraint (extensible source types)",
      fn: (db) => { db.exec(MIGRATE_V4_SQL); },
    },
  ];

  const pending = migrations.filter((m) => m.version > current);
  for (const migration of pending) {
    db.transaction(() => {
      migration.fn(db);
      db.query(
        "INSERT INTO schema_version (version, applied_at, description) VALUES (?, datetime('now'), ?)"
      ).run(migration.version, migration.description);
    })();
  }
}

/**
 * Close the database cleanly.
 */
export function closeDatabase(db: Database): void {
  db.close();
}
