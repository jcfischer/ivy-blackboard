import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDatabase, closeDatabase } from "../src/db";
import { resetConfigCache } from "../src/config";
import type { Database } from "bun:sqlite";

let db: Database;
let dbPath: string;
let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `bb-work-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  dbPath = join(tmpDir, "test.db");
  resetConfigCache();
  db = openDatabase(dbPath);
});

afterEach(() => {
  closeDatabase(db);
  rmSync(tmpDir, { recursive: true, force: true });
});

// T-1.1: Core createWorkItem
describe("createWorkItem", () => {
  test("creates work item with all fields", async () => {
    const { createWorkItem } = await import("../src/work");
    const result = createWorkItem(db, {
      id: "task-1",
      title: "Implement schema",
      description: "Create the SQLite schema",
      project: null,
      source: "local",
      priority: "P1",
    });

    expect(result.item_id).toBe("task-1");
    expect(result.title).toBe("Implement schema");
    expect(result.status).toBe("available");
    expect(result.claimed_by).toBeNull();
    expect(result.created_at).toBeTruthy();

    const row = db.query("SELECT * FROM work_items WHERE item_id = ?").get("task-1") as any;
    expect(row).not.toBeNull();
    expect(row.title).toBe("Implement schema");
    expect(row.description).toBe("Create the SQLite schema");
    expect(row.source).toBe("local");
    expect(row.priority).toBe("P1");
    expect(row.status).toBe("available");
  });

  test("uses default source and priority", async () => {
    const { createWorkItem } = await import("../src/work");
    const result = createWorkItem(db, { id: "task-2", title: "Default test" });

    const row = db.query("SELECT source, priority FROM work_items WHERE item_id = ?").get("task-2") as any;
    expect(row.source).toBe("local");
    expect(row.priority).toBe("P2");
  });

  test("emits work_created event", async () => {
    const { createWorkItem } = await import("../src/work");
    createWorkItem(db, { id: "task-3", title: "Event test" });

    const event = db.query(
      "SELECT * FROM events WHERE event_type = 'work_created' AND target_id = ?"
    ).get("task-3") as any;

    expect(event).not.toBeNull();
    expect(event.target_type).toBe("work_item");
    expect(event.summary).toContain("Event test");
  });

  test("stores source_ref and metadata", async () => {
    const { createWorkItem } = await import("../src/work");
    createWorkItem(db, {
      id: "task-4",
      title: "With refs",
      source: "github",
      sourceRef: "https://github.com/org/repo/issues/1",
      metadata: '{"labels": ["bug"]}',
    });

    const row = db.query("SELECT source_ref, metadata FROM work_items WHERE item_id = ?").get("task-4") as any;
    expect(row.source_ref).toBe("https://github.com/org/repo/issues/1");
    expect(JSON.parse(row.metadata)).toEqual({ labels: ["bug"] });
  });

  test("throws on duplicate item_id", async () => {
    const { createWorkItem } = await import("../src/work");
    createWorkItem(db, { id: "dup", title: "First" });
    expect(() => createWorkItem(db, { id: "dup", title: "Second" })).toThrow("dup");
  });

  test("throws on invalid source", async () => {
    const { createWorkItem } = await import("../src/work");
    expect(() => createWorkItem(db, { id: "bad-src", title: "Bad", source: "invalid" })).toThrow("invalid");
  });

  test("throws on invalid priority", async () => {
    const { createWorkItem } = await import("../src/work");
    expect(() => createWorkItem(db, { id: "bad-pri", title: "Bad", priority: "P9" })).toThrow("P9");
  });

  test("throws on invalid metadata JSON", async () => {
    const { createWorkItem } = await import("../src/work");
    expect(() => createWorkItem(db, { id: "bad-meta", title: "Bad", metadata: "not{json" })).toThrow();
  });
});

// T-2.1: Core claimWorkItem
describe("claimWorkItem", () => {
  test("claims available work item", async () => {
    const { createWorkItem, claimWorkItem } = await import("../src/work");
    const { registerAgent } = await import("../src/agent");

    createWorkItem(db, { id: "claim-1", title: "Claimable" });
    const agent = registerAgent(db, { name: "Claimer" });

    const result = claimWorkItem(db, "claim-1", agent.session_id);
    expect(result.item_id).toBe("claim-1");
    expect(result.claimed).toBe(true);
    expect(result.claimed_by).toBe(agent.session_id);
    expect(result.claimed_at).toBeTruthy();

    const row = db.query("SELECT status, claimed_by FROM work_items WHERE item_id = ?").get("claim-1") as any;
    expect(row.status).toBe("claimed");
    expect(row.claimed_by).toBe(agent.session_id);
  });

  test("returns claimed=false on conflict", async () => {
    const { createWorkItem, claimWorkItem } = await import("../src/work");
    const { registerAgent } = await import("../src/agent");

    createWorkItem(db, { id: "conflict-1", title: "Contested" });
    const agent1 = registerAgent(db, { name: "Agent1" });
    const agent2 = registerAgent(db, { name: "Agent2" });

    const first = claimWorkItem(db, "conflict-1", agent1.session_id);
    expect(first.claimed).toBe(true);

    const second = claimWorkItem(db, "conflict-1", agent2.session_id);
    expect(second.claimed).toBe(false);
    expect(second.claimed_by).toBeNull();
  });

  test("emits work_claimed event on success", async () => {
    const { createWorkItem, claimWorkItem } = await import("../src/work");
    const { registerAgent } = await import("../src/agent");

    createWorkItem(db, { id: "evt-claim", title: "Event claim" });
    const agent = registerAgent(db, { name: "Claimer" });
    claimWorkItem(db, "evt-claim", agent.session_id);

    const event = db.query(
      "SELECT * FROM events WHERE event_type = 'work_claimed' AND target_id = ?"
    ).get("evt-claim") as any;

    expect(event).not.toBeNull();
    expect(event.actor_id).toBe(agent.session_id);
    expect(event.summary).toContain("Event claim");
  });

  test("does not emit event on conflict", async () => {
    const { createWorkItem, claimWorkItem } = await import("../src/work");
    const { registerAgent } = await import("../src/agent");

    createWorkItem(db, { id: "no-evt", title: "No event" });
    const a1 = registerAgent(db, { name: "A1" });
    const a2 = registerAgent(db, { name: "A2" });
    claimWorkItem(db, "no-evt", a1.session_id);

    claimWorkItem(db, "no-evt", a2.session_id);

    const events = db.query(
      "SELECT COUNT(*) as count FROM events WHERE event_type = 'work_claimed' AND target_id = ?"
    ).get("no-evt") as any;
    expect(events.count).toBe(1); // only from first claim
  });

  test("throws on non-existent item", async () => {
    const { claimWorkItem } = await import("../src/work");
    const { registerAgent } = await import("../src/agent");
    const agent = registerAgent(db, { name: "Claimer" });

    expect(() => claimWorkItem(db, "nonexistent", agent.session_id)).toThrow("nonexistent");
  });

  test("throws on non-existent session", async () => {
    const { createWorkItem, claimWorkItem } = await import("../src/work");
    createWorkItem(db, { id: "orphan-claim", title: "Orphan" });

    expect(() => claimWorkItem(db, "orphan-claim", "fake-session")).toThrow("fake-session");
  });
});

// T-2.2: createAndClaimWorkItem
describe("createAndClaimWorkItem", () => {
  test("creates and claims in one transaction", async () => {
    const { createAndClaimWorkItem } = await import("../src/work");
    const { registerAgent } = await import("../src/agent");

    const agent = registerAgent(db, { name: "Creator" });
    const result = createAndClaimWorkItem(db, { id: "combo-1", title: "Create and claim" }, agent.session_id);

    expect(result.item_id).toBe("combo-1");
    expect(result.status).toBe("claimed");
    expect(result.claimed_by).toBe(agent.session_id);

    const row = db.query("SELECT status, claimed_by FROM work_items WHERE item_id = ?").get("combo-1") as any;
    expect(row.status).toBe("claimed");
    expect(row.claimed_by).toBe(agent.session_id);
  });

  test("emits both work_created and work_claimed events", async () => {
    const { createAndClaimWorkItem } = await import("../src/work");
    const { registerAgent } = await import("../src/agent");

    const agent = registerAgent(db, { name: "Creator" });
    createAndClaimWorkItem(db, { id: "both-evt", title: "Both events" }, agent.session_id);

    const created = db.query(
      "SELECT * FROM events WHERE event_type = 'work_created' AND target_id = ?"
    ).get("both-evt") as any;
    const claimed = db.query(
      "SELECT * FROM events WHERE event_type = 'work_claimed' AND target_id = ?"
    ).get("both-evt") as any;

    expect(created).not.toBeNull();
    expect(claimed).not.toBeNull();
  });
});

// T-4.1: CLI E2E
describe("CLI work claim", () => {
  test("create-and-claim outputs JSON", async () => {
    // Register agent first
    const regProc = Bun.spawn(
      ["bun", "src/index.ts", "--db", dbPath, "--json", "agent", "register", "--name", "CLIAgent"],
      { cwd: "/Users/fischer/work/ivy-blackboard", stdout: "pipe", stderr: "pipe" }
    );
    const regText = await new Response(regProc.stdout).text();
    await regProc.exited;
    const sessionId = JSON.parse(regText).session_id;

    // Create and claim
    const claimProc = Bun.spawn(
      ["bun", "src/index.ts", "--db", dbPath, "--json", "work", "claim",
       "--id", "cli-task", "--title", "CLI Task", "--session", sessionId, "--priority", "P1"],
      { cwd: "/Users/fischer/work/ivy-blackboard", stdout: "pipe", stderr: "pipe" }
    );
    const claimText = await new Response(claimProc.stdout).text();
    await claimProc.exited;

    const json = JSON.parse(claimText);
    expect(json.ok).toBe(true);
    expect(json.item_id).toBe("cli-task");
    expect(json.title).toBe("CLI Task");
    expect(json.status).toBe("claimed");
    expect(json.claimed_by).toBe(sessionId);
  });

  test("create without claim outputs JSON", async () => {
    const proc = Bun.spawn(
      ["bun", "src/index.ts", "--db", dbPath, "--json", "work", "claim",
       "--id", "no-claim", "--title", "Unclaimed"],
      { cwd: "/Users/fischer/work/ivy-blackboard", stdout: "pipe", stderr: "pipe" }
    );
    const text = await new Response(proc.stdout).text();
    await proc.exited;

    const json = JSON.parse(text);
    expect(json.ok).toBe(true);
    expect(json.item_id).toBe("no-claim");
    expect(json.status).toBe("available");
    expect(json.claimed_by).toBeNull();
  });
});
