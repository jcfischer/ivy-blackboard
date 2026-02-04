import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveDbPath, openDatabase, closeDatabase, getSchemaVersion } from "../src/db";
import { resetConfigCache } from "../src/config";

const TEST_DIR = join(tmpdir(), `blackboard-test-${Date.now()}`);

describe("resolveDbPath", () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
    // Clear env and config cache
    delete process.env.BLACKBOARD_DB;
    resetConfigCache();
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    resetConfigCache();
  });

  it("prefers --db flag over everything", () => {
    const explicit = join(TEST_DIR, "explicit.db");
    process.env.BLACKBOARD_DB = join(TEST_DIR, "env.db");
    const result = resolveDbPath({ dbPath: explicit });
    expect(result).toBe(explicit);
    delete process.env.BLACKBOARD_DB;
  });

  it("uses $BLACKBOARD_DB when no --db flag", () => {
    const envPath = join(TEST_DIR, "env.db");
    process.env.BLACKBOARD_DB = envPath;
    const result = resolveDbPath({});
    expect(result).toBe(envPath);
    delete process.env.BLACKBOARD_DB;
  });

  it("uses .blackboard/local.db when directory exists", () => {
    const projectDir = join(TEST_DIR, "project");
    const bbDir = join(projectDir, ".blackboard");
    mkdirSync(bbDir, { recursive: true });

    const result = resolveDbPath({}, projectDir);
    expect(result).toBe(join(bbDir, "local.db"));
  });

  it("falls back to ~/.pai/blackboard/local.db", () => {
    const fakeHome = join(TEST_DIR, "home");
    mkdirSync(fakeHome, { recursive: true });

    const result = resolveDbPath({}, TEST_DIR, fakeHome);
    const expected = join(fakeHome, ".pai", "blackboard", "local.db");
    expect(result).toBe(expected);
  });

  it("creates ~/.pai/blackboard/ directory if it doesn't exist", () => {
    const fakeHome = join(TEST_DIR, "newhome");
    mkdirSync(fakeHome, { recursive: true });

    resolveDbPath({}, TEST_DIR, fakeHome);
    expect(existsSync(join(fakeHome, ".pai", "blackboard"))).toBe(true);
  });

  it("uses config.database.projectDir for project directory name", () => {
    resetConfigCache();
    const projectDir = join(TEST_DIR, "project");
    // Create a custom-named project dir
    const customDir = join(projectDir, ".my-blackboard");
    mkdirSync(customDir, { recursive: true });
    const configDir = join(TEST_DIR, "cfg");
    mkdirSync(configDir, { recursive: true });
    const configPath = join(configDir, "config.json");
    writeFileSync(
      configPath,
      JSON.stringify({ database: { projectDir: ".my-blackboard" } })
    );

    // Load config from our custom path
    const { loadConfig } = require("../src/config");
    loadConfig(configPath);

    const result = resolveDbPath({}, projectDir);
    expect(result).toBe(join(customDir, "local.db"));
  });
});

describe("openDatabase", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = join(TEST_DIR, `test-${Date.now()}.db`);
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("creates a fresh database with all tables", () => {
    const db = openDatabase(dbPath);
    const tables = db
      .query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);

    expect(names).toContain("agents");
    expect(names).toContain("projects");
    expect(names).toContain("work_items");
    expect(names).toContain("heartbeats");
    expect(names).toContain("events");
    expect(names).toContain("schema_version");
    closeDatabase(db);
  });

  it("sets WAL mode on new database", () => {
    const db = openDatabase(dbPath);
    const mode = db.query("PRAGMA journal_mode").get() as any;
    expect(mode.journal_mode).toBe("wal");
    closeDatabase(db);
  });

  it("sets foreign_keys ON", () => {
    const db = openDatabase(dbPath);
    const fk = db.query("PRAGMA foreign_keys").get() as any;
    expect(fk.foreign_keys).toBe(1);
    closeDatabase(db);
  });

  it("sets busy_timeout to 5000", () => {
    const db = openDatabase(dbPath);
    const timeout = db.query("PRAGMA busy_timeout").get() as any;
    expect(timeout.timeout).toBe(5000);
    closeDatabase(db);
  });

  it("sets schema_version to current version", () => {
    const db = openDatabase(dbPath);
    expect(getSchemaVersion(db)).toBe(2);
    closeDatabase(db);
  });

  it("is idempotent — opening existing DB does not error", () => {
    const db1 = openDatabase(dbPath);
    closeDatabase(db1);

    const db2 = openDatabase(dbPath);
    const tables = db2
      .query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      )
      .all() as { name: string }[];
    expect(tables).toHaveLength(6);
    expect(getSchemaVersion(db2)).toBe(2);
    closeDatabase(db2);
  });

  it("creates indexes", () => {
    const db = openDatabase(dbPath);
    const indexes = db
      .query(
        "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name"
      )
      .all() as { name: string }[];
    expect(indexes.length).toBeGreaterThanOrEqual(13);
    closeDatabase(db);
  });
});
