import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDatabase, closeDatabase } from "../src/db";
import { resetConfigCache } from "../src/config";
import type { Database } from "bun:sqlite";

const PROJECT_ROOT = join(import.meta.dir, "..");

let db: Database;
let dbPath: string;
let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `bb-sweep-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  dbPath = join(tmpDir, "test.db");
  resetConfigCache();
  db = openDatabase(dbPath);
});

afterEach(() => {
  closeDatabase(db);
  rmSync(tmpDir, { recursive: true, force: true });
});

// T-1.1: isPidAlive
describe("isPidAlive", () => {
  test("returns false for null pid", async () => {
    const { isPidAlive } = await import("../src/sweep");
    expect(isPidAlive(null)).toBe(false);
  });

  test("returns true for current process pid", async () => {
    const { isPidAlive } = await import("../src/sweep");
    expect(isPidAlive(process.pid)).toBe(true);
  });

  test("returns false for non-existent pid", async () => {
    const { isPidAlive } = await import("../src/sweep");
    // Use a very high PID that almost certainly doesn't exist
    expect(isPidAlive(4294967)).toBe(false);
  });
});

// T-2.1: sweepStaleAgents core
describe("sweepStaleAgents", () => {
  test("marks stale agent with dead pid", async () => {
    const { sweepStaleAgents } = await import("../src/sweep");
    const { registerAgent } = await import("../src/agent");

    // Register agent with pid=null (always dead for sweep)
    const agent = registerAgent(db, { name: "DeadAgent" });

    // Set last_seen_at to old timestamp via direct SQL
    db.query("UPDATE agents SET pid = NULL, last_seen_at = ? WHERE session_id = ?")
      .run("2020-01-01T00:00:00Z", agent.session_id);

    const result = sweepStaleAgents(db, { staleThresholdSeconds: 60 });

    expect(result.staleAgents.length).toBe(1);
    expect(result.staleAgents[0].sessionId).toBe(agent.session_id);

    const row = db.query("SELECT status FROM agents WHERE session_id = ?")
      .get(agent.session_id) as any;
    expect(row.status).toBe("stale");
  });

  test("releases claimed work items when agent goes stale", async () => {
    const { sweepStaleAgents } = await import("../src/sweep");
    const { registerAgent } = await import("../src/agent");
    const { createWorkItem, claimWorkItem } = await import("../src/work");

    const agent = registerAgent(db, { name: "StaleWorker" });
    createWorkItem(db, { id: "sweep-item-1", title: "Claimed item" });
    claimWorkItem(db, "sweep-item-1", agent.session_id);

    // Make agent stale
    db.query("UPDATE agents SET pid = NULL, last_seen_at = ? WHERE session_id = ?")
      .run("2020-01-01T00:00:00Z", agent.session_id);

    const result = sweepStaleAgents(db, { staleThresholdSeconds: 60 });

    expect(result.staleAgents[0].releasedItems).toContain("sweep-item-1");

    const item = db.query("SELECT status, claimed_by, claimed_at FROM work_items WHERE item_id = ?")
      .get("sweep-item-1") as any;
    expect(item.status).toBe("available");
    expect(item.claimed_by).toBeNull();
    expect(item.claimed_at).toBeNull();
  });

  test("emits agent_stale event", async () => {
    const { sweepStaleAgents } = await import("../src/sweep");
    const { registerAgent } = await import("../src/agent");

    const agent = registerAgent(db, { name: "EventAgent" });
    db.query("UPDATE agents SET pid = NULL, last_seen_at = ? WHERE session_id = ?")
      .run("2020-01-01T00:00:00Z", agent.session_id);

    sweepStaleAgents(db, { staleThresholdSeconds: 60 });

    const event = db.query(
      "SELECT * FROM events WHERE event_type = 'agent_stale' AND target_id = ?"
    ).get(agent.session_id) as any;
    expect(event).not.toBeNull();
    expect(event.target_type).toBe("agent");
  });

  test("emits stale_locks_released event when items released", async () => {
    const { sweepStaleAgents } = await import("../src/sweep");
    const { registerAgent } = await import("../src/agent");
    const { createWorkItem, claimWorkItem } = await import("../src/work");

    const agent = registerAgent(db, { name: "LockAgent" });
    createWorkItem(db, { id: "lock-item", title: "Locked" });
    claimWorkItem(db, "lock-item", agent.session_id);

    db.query("UPDATE agents SET pid = NULL, last_seen_at = ? WHERE session_id = ?")
      .run("2020-01-01T00:00:00Z", agent.session_id);

    sweepStaleAgents(db, { staleThresholdSeconds: 60 });

    const event = db.query(
      "SELECT * FROM events WHERE event_type = 'stale_locks_released' AND target_id = ?"
    ).get(agent.session_id) as any;
    expect(event).not.toBeNull();
  });

  test("refreshes last_seen_at for agent with alive pid", async () => {
    const { sweepStaleAgents } = await import("../src/sweep");
    const { registerAgent } = await import("../src/agent");

    const agent = registerAgent(db, { name: "AliveAgent" });
    // Set stale timestamp but keep alive PID (process.pid from registerAgent)
    db.query("UPDATE agents SET last_seen_at = ? WHERE session_id = ?")
      .run("2020-01-01T00:00:00Z", agent.session_id);

    const result = sweepStaleAgents(db, { staleThresholdSeconds: 60 });

    expect(result.staleAgents.length).toBe(0);
    expect(result.pidsVerified).toContain(agent.session_id);

    const row = db.query("SELECT last_seen_at FROM agents WHERE session_id = ?")
      .get(agent.session_id) as any;
    expect(row.last_seen_at).not.toBe("2020-01-01T00:00:00Z");
  });

  test("prunes old heartbeats", async () => {
    const { sweepStaleAgents } = await import("../src/sweep");
    const { registerAgent } = await import("../src/agent");

    const agent = registerAgent(db, { name: "HeartbeatAgent" });

    // Insert old heartbeat records
    db.query("INSERT INTO heartbeats (session_id, timestamp) VALUES (?, ?)")
      .run(agent.session_id, "2020-01-01T00:00:00Z");
    db.query("INSERT INTO heartbeats (session_id, timestamp) VALUES (?, ?)")
      .run(agent.session_id, "2020-01-02T00:00:00Z");
    // Insert recent heartbeat
    db.query("INSERT INTO heartbeats (session_id, timestamp) VALUES (?, ?)")
      .run(agent.session_id, new Date().toISOString());

    const result = sweepStaleAgents(db, { pruneHeartbeatsAfterDays: 7 });

    expect(result.heartbeatsPruned).toBe(2);

    const count = db.query("SELECT COUNT(*) as count FROM heartbeats").get() as any;
    expect(count.count).toBe(1);
  });

  // T-2.2: Edge cases
  test("agent with pid=null treated as dead", async () => {
    const { sweepStaleAgents } = await import("../src/sweep");
    const { registerAgent } = await import("../src/agent");

    const agent = registerAgent(db, { name: "NullPid" });
    db.query("UPDATE agents SET pid = NULL, last_seen_at = ? WHERE session_id = ?")
      .run("2020-01-01T00:00:00Z", agent.session_id);

    const result = sweepStaleAgents(db, { staleThresholdSeconds: 60 });
    expect(result.staleAgents.length).toBe(1);
  });

  test("sweep with no candidates returns empty result", async () => {
    const { sweepStaleAgents } = await import("../src/sweep");

    const result = sweepStaleAgents(db, { staleThresholdSeconds: 60 });
    expect(result.staleAgents).toEqual([]);
    expect(result.pidsVerified).toEqual([]);
    expect(result.heartbeatsPruned).toBe(0);
  });

  test("does not sweep agents with recent last_seen_at", async () => {
    const { sweepStaleAgents } = await import("../src/sweep");
    const { registerAgent } = await import("../src/agent");

    registerAgent(db, { name: "FreshAgent" }); // last_seen_at = now

    const result = sweepStaleAgents(db, { staleThresholdSeconds: 300 });
    expect(result.staleAgents.length).toBe(0);
    expect(result.pidsVerified.length).toBe(0);
  });

  test("does not sweep completed or already stale agents", async () => {
    const { sweepStaleAgents } = await import("../src/sweep");
    const { registerAgent } = await import("../src/agent");

    const agent = registerAgent(db, { name: "CompletedAgent" });
    db.query("UPDATE agents SET status = 'completed', last_seen_at = ? WHERE session_id = ?")
      .run("2020-01-01T00:00:00Z", agent.session_id);

    const agent2 = registerAgent(db, { name: "AlreadyStale" });
    db.query("UPDATE agents SET status = 'stale', last_seen_at = ? WHERE session_id = ?")
      .run("2020-01-01T00:00:00Z", agent2.session_id);

    const result = sweepStaleAgents(db, { staleThresholdSeconds: 60 });
    expect(result.staleAgents.length).toBe(0);
  });
});

// T-3.1: Auto-sweep in createContext
describe("auto-sweep in createContext", () => {
  test("createContext sweeps stale agents silently", async () => {
    const { registerAgent } = await import("../src/agent");
    const { createContext, resetContextState } = await import("../src/context");

    // Create a stale agent in the DB before createContext
    const agent = registerAgent(db, { name: "PreStale" });
    db.query("UPDATE agents SET pid = NULL, last_seen_at = ? WHERE session_id = ?")
      .run("2020-01-01T00:00:00Z", agent.session_id);

    closeDatabase(db);

    // Re-open via createContext which should auto-sweep
    resetContextState();
    resetConfigCache();
    const ctx = createContext({ json: false, db: dbPath });

    const row = ctx.db.query("SELECT status FROM agents WHERE session_id = ?")
      .get(agent.session_id) as any;
    expect(row.status).toBe("stale");

    closeDatabase(ctx.db);
    resetContextState();
    // Re-open for afterEach cleanup
    db = openDatabase(dbPath);
  });
});

// T-3.2: CLI sweep command
describe("CLI sweep", () => {
  test("sweep outputs JSON result", async () => {
    // Create a stale agent first
    const { registerAgent } = await import("../src/agent");
    const agent = registerAgent(db, { name: "CLIStale" });
    db.query("UPDATE agents SET pid = NULL, last_seen_at = ? WHERE session_id = ?")
      .run("2020-01-01T00:00:00Z", agent.session_id);

    closeDatabase(db);

    const proc = Bun.spawn(
      ["bun", "src/index.ts", "--db", dbPath, "--json", "sweep"],
      { cwd: PROJECT_ROOT, stdout: "pipe", stderr: "pipe" }
    );
    const text = await new Response(proc.stdout).text();
    await proc.exited;

    const json = JSON.parse(text);
    expect(json.ok).toBe(true);
    expect(json.staleAgents).toBeArray();
    expect(json.staleAgents.length).toBe(1);

    db = openDatabase(dbPath);
  });

  test("sweep --dry-run does not modify state", async () => {
    const { registerAgent } = await import("../src/agent");
    const agent = registerAgent(db, { name: "DryRunAgent" });
    db.query("UPDATE agents SET pid = NULL, last_seen_at = ? WHERE session_id = ?")
      .run("2020-01-01T00:00:00Z", agent.session_id);

    closeDatabase(db);

    const proc = Bun.spawn(
      ["bun", "src/index.ts", "--db", dbPath, "--json", "sweep", "--dry-run"],
      { cwd: PROJECT_ROOT, stdout: "pipe", stderr: "pipe" }
    );
    const text = await new Response(proc.stdout).text();
    await proc.exited;

    const json = JSON.parse(text);
    expect(json.ok).toBe(true);
    expect(json.dryRun).toBe(true);
    expect(json.candidates.length).toBe(1);

    // Verify agent NOT marked stale
    db = openDatabase(dbPath);
    const row = db.query("SELECT status FROM agents WHERE session_id = ?")
      .get(agent.session_id) as any;
    expect(row.status).toBe("active");
  });

  test("sweep --threshold overrides config", async () => {
    const { registerAgent } = await import("../src/agent");
    const agent = registerAgent(db, { name: "ThresholdAgent" });

    // Set last_seen_at to 10 seconds ago
    const tenSecsAgo = new Date(Date.now() - 10000).toISOString();
    db.query("UPDATE agents SET pid = NULL, last_seen_at = ? WHERE session_id = ?")
      .run(tenSecsAgo, agent.session_id);

    closeDatabase(db);

    // With threshold=5, the agent (10s old) should be stale
    const proc = Bun.spawn(
      ["bun", "src/index.ts", "--db", dbPath, "--json", "sweep", "--threshold", "5"],
      { cwd: PROJECT_ROOT, stdout: "pipe", stderr: "pipe" }
    );
    const text = await new Response(proc.stdout).text();
    await proc.exited;

    const json = JSON.parse(text);
    expect(json.ok).toBe(true);
    expect(json.staleAgents.length).toBe(1);

    db = openDatabase(dbPath);
  });

  test("sweep with no stale agents outputs message", async () => {
    closeDatabase(db);

    const proc = Bun.spawn(
      ["bun", "src/index.ts", "--db", dbPath, "sweep"],
      { cwd: PROJECT_ROOT, stdout: "pipe", stderr: "pipe" }
    );
    const text = await new Response(proc.stdout).text();
    await proc.exited;

    expect(text.trim()).toContain("No stale agents detected");

    db = openDatabase(dbPath);
  });
});
