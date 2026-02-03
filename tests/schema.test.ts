import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  PRAGMA_SQL,
  CREATE_TABLES_SQL,
  CREATE_INDEXES_SQL,
  SEED_VERSION_SQL,
  CURRENT_SCHEMA_VERSION,
} from "../src/schema";

describe("schema SQL constants", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  it("PRAGMA_SQL sets WAL mode, FK, and busy_timeout", () => {
    for (const sql of PRAGMA_SQL) {
      db.exec(sql);
    }
    const walMode = db.query("PRAGMA journal_mode").get() as any;
    // In-memory databases return "memory" for journal_mode, but the PRAGMA still executes
    expect(walMode.journal_mode).toBeDefined();

    const fk = db.query("PRAGMA foreign_keys").get() as any;
    expect(fk.foreign_keys).toBe(1);

    const timeout = db.query("PRAGMA busy_timeout").get() as any;
    expect(timeout.timeout).toBe(5000);
  });

  it("CREATE_TABLES_SQL creates all 6 tables", () => {
    for (const sql of PRAGMA_SQL) {
      db.exec(sql);
    }
    db.exec(CREATE_TABLES_SQL);

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
    expect(names).toHaveLength(6);
  });

  it("CREATE_INDEXES_SQL creates all expected indexes", () => {
    for (const sql of PRAGMA_SQL) {
      db.exec(sql);
    }
    db.exec(CREATE_TABLES_SQL);
    db.exec(CREATE_INDEXES_SQL);

    const indexes = db
      .query(
        "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all() as { name: string }[];
    const names = indexes.map((i) => i.name);

    expect(names).toContain("idx_agents_status");
    expect(names).toContain("idx_agents_project");
    expect(names).toContain("idx_agents_parent");
    expect(names).toContain("idx_agents_last_seen");
    expect(names).toContain("idx_work_items_status");
    expect(names).toContain("idx_work_items_project");
    expect(names).toContain("idx_work_items_claimed_by");
    expect(names).toContain("idx_work_items_priority");
    expect(names).toContain("idx_heartbeats_session");
    expect(names).toContain("idx_heartbeats_timestamp");
    expect(names).toContain("idx_events_timestamp");
    expect(names).toContain("idx_events_type");
    expect(names).toContain("idx_events_actor");
  });

  it("SEED_VERSION_SQL inserts version 1", () => {
    for (const sql of PRAGMA_SQL) {
      db.exec(sql);
    }
    db.exec(CREATE_TABLES_SQL);
    db.exec(SEED_VERSION_SQL);

    const version = db.query("SELECT version FROM schema_version").get() as any;
    expect(version.version).toBe(1);
  });

  it("CURRENT_SCHEMA_VERSION equals 1", () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(1);
  });
});

describe("CHECK constraints", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    for (const sql of PRAGMA_SQL) {
      db.exec(sql);
    }
    db.exec(CREATE_TABLES_SQL);
  });

  afterEach(() => {
    db.close();
  });

  it("agents rejects invalid status", () => {
    expect(() => {
      db.query(
        "INSERT INTO agents (session_id, agent_name, status, started_at, last_seen_at) VALUES (?, ?, ?, ?, ?)"
      ).run("s1", "test", "invalid", "2026-01-01", "2026-01-01");
    }).toThrow();
  });

  it("agents accepts valid statuses", () => {
    for (const status of ["active", "idle", "completed", "stale"]) {
      db.query(
        "INSERT INTO agents (session_id, agent_name, status, started_at, last_seen_at) VALUES (?, ?, ?, ?, ?)"
      ).run(`s-${status}`, "test", status, "2026-01-01", "2026-01-01");
    }
    const count = db.query("SELECT COUNT(*) as c FROM agents").get() as any;
    expect(count.c).toBe(4);
  });

  it("work_items rejects invalid source", () => {
    expect(() => {
      db.query(
        "INSERT INTO work_items (item_id, title, source, created_at) VALUES (?, ?, ?, ?)"
      ).run("w1", "test", "invalid", "2026-01-01");
    }).toThrow();
  });

  it("work_items rejects invalid status", () => {
    expect(() => {
      db.query(
        "INSERT INTO work_items (item_id, title, source, status, created_at) VALUES (?, ?, ?, ?, ?)"
      ).run("w1", "test", "local", "invalid", "2026-01-01");
    }).toThrow();
  });

  it("work_items rejects invalid priority", () => {
    expect(() => {
      db.query(
        "INSERT INTO work_items (item_id, title, source, priority, created_at) VALUES (?, ?, ?, ?, ?)"
      ).run("w1", "test", "local", "P4", "2026-01-01");
    }).toThrow();
  });

  it("events rejects invalid event_type", () => {
    expect(() => {
      db.query(
        "INSERT INTO events (timestamp, event_type, summary) VALUES (?, ?, ?)"
      ).run("2026-01-01", "invalid_type", "test");
    }).toThrow();
  });

  it("events accepts all valid event_types", () => {
    const types = [
      "agent_registered", "agent_deregistered", "agent_stale", "agent_recovered",
      "work_claimed", "work_released", "work_completed", "work_blocked", "work_created",
      "project_registered", "project_updated", "heartbeat_received", "stale_locks_released",
    ];
    for (const type of types) {
      db.query(
        "INSERT INTO events (timestamp, event_type, summary) VALUES (?, ?, ?)"
      ).run("2026-01-01", type, `test ${type}`);
    }
    const count = db.query("SELECT COUNT(*) as c FROM events").get() as any;
    expect(count.c).toBe(13);
  });

  it("events rejects invalid target_type", () => {
    expect(() => {
      db.query(
        "INSERT INTO events (timestamp, event_type, target_type, summary) VALUES (?, ?, ?, ?)"
      ).run("2026-01-01", "agent_registered", "invalid", "test");
    }).toThrow();
  });
});

describe("FK constraints", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    for (const sql of PRAGMA_SQL) {
      db.exec(sql);
    }
    db.exec(CREATE_TABLES_SQL);
  });

  afterEach(() => {
    db.close();
  });

  it("agents rejects invalid parent_id", () => {
    expect(() => {
      db.query(
        "INSERT INTO agents (session_id, agent_name, parent_id, status, started_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run("s1", "test", "nonexistent", "active", "2026-01-01", "2026-01-01");
    }).toThrow();
  });

  it("agents accepts valid parent_id", () => {
    db.query(
      "INSERT INTO agents (session_id, agent_name, status, started_at, last_seen_at) VALUES (?, ?, ?, ?, ?)"
    ).run("parent", "Parent", "active", "2026-01-01", "2026-01-01");

    db.query(
      "INSERT INTO agents (session_id, agent_name, parent_id, status, started_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("child", "Child", "parent", "active", "2026-01-01", "2026-01-01");

    const child = db.query("SELECT parent_id FROM agents WHERE session_id = 'child'").get() as any;
    expect(child.parent_id).toBe("parent");
  });

  it("work_items rejects invalid project_id", () => {
    expect(() => {
      db.query(
        "INSERT INTO work_items (item_id, project_id, title, source, created_at) VALUES (?, ?, ?, ?, ?)"
      ).run("w1", "nonexistent", "test", "local", "2026-01-01");
    }).toThrow();
  });

  it("heartbeats rejects invalid session_id", () => {
    expect(() => {
      db.query(
        "INSERT INTO heartbeats (session_id, timestamp) VALUES (?, ?)"
      ).run("nonexistent", "2026-01-01");
    }).toThrow();
  });
});
