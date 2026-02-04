import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDatabase, closeDatabase } from "../src/db";
import { resetConfigCache } from "../src/config";
import type { Database } from "bun:sqlite";

const PROJECT_ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

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

// F-10 T-1.1: listWorkItems
describe("listWorkItems", () => {
  test("returns available items by default", async () => {
    const { createWorkItem, claimWorkItem, listWorkItems } = await import("../src/work");
    const { registerAgent } = await import("../src/agent");

    createWorkItem(db, { id: "avail-1", title: "Available" });
    createWorkItem(db, { id: "claimed-1", title: "Claimed" });
    const agent = registerAgent(db, { name: "Claimer" });
    claimWorkItem(db, "claimed-1", agent.session_id);

    const items = listWorkItems(db);
    expect(items.length).toBe(1);
    expect(items[0].item_id).toBe("avail-1");
    expect(items[0].status).toBe("available");
  });

  test("orders by priority ASC then created_at DESC", async () => {
    const { createWorkItem, listWorkItems } = await import("../src/work");

    // Insert with explicit created_at via SQL to control ordering
    db.query(`INSERT INTO work_items (item_id, title, source, status, priority, created_at) VALUES (?, ?, 'local', 'available', ?, ?)`).run("p3-old", "P3 Old", "P3", "2025-01-01T00:00:00Z");
    db.query(`INSERT INTO work_items (item_id, title, source, status, priority, created_at) VALUES (?, ?, 'local', 'available', ?, ?)`).run("p1-item", "P1 Item", "P1", "2025-01-02T00:00:00Z");
    db.query(`INSERT INTO work_items (item_id, title, source, status, priority, created_at) VALUES (?, ?, 'local', 'available', ?, ?)`).run("p2-item", "P2 Item", "P2", "2025-01-02T00:00:00Z");
    db.query(`INSERT INTO work_items (item_id, title, source, status, priority, created_at) VALUES (?, ?, 'local', 'available', ?, ?)`).run("p3-new", "P3 New", "P3", "2025-01-03T00:00:00Z");

    const items = listWorkItems(db);
    expect(items.map(i => i.item_id)).toEqual(["p1-item", "p2-item", "p3-new", "p3-old"]);
  });

  test("--all returns all statuses", async () => {
    const { createWorkItem, claimWorkItem, listWorkItems } = await import("../src/work");
    const { registerAgent } = await import("../src/agent");

    createWorkItem(db, { id: "all-1", title: "Available" });
    createWorkItem(db, { id: "all-2", title: "Claimed" });
    const agent = registerAgent(db, { name: "Agent" });
    claimWorkItem(db, "all-2", agent.session_id);

    const items = listWorkItems(db, { all: true });
    expect(items.length).toBe(2);
  });

  test("filters by status (comma-separated)", async () => {
    const { createWorkItem, claimWorkItem, listWorkItems } = await import("../src/work");
    const { registerAgent } = await import("../src/agent");

    createWorkItem(db, { id: "sf-1", title: "Available" });
    createWorkItem(db, { id: "sf-2", title: "Claimed" });
    const agent = registerAgent(db, { name: "Agent" });
    claimWorkItem(db, "sf-2", agent.session_id);

    const items = listWorkItems(db, { status: "claimed" });
    expect(items.length).toBe(1);
    expect(items[0].item_id).toBe("sf-2");

    const multi = listWorkItems(db, { status: "available,claimed" });
    expect(multi.length).toBe(2);
  });

  test("filters by priority (comma-separated)", async () => {
    const { createWorkItem, listWorkItems } = await import("../src/work");

    createWorkItem(db, { id: "pf-1", title: "P1", priority: "P1" });
    createWorkItem(db, { id: "pf-2", title: "P2", priority: "P2" });
    createWorkItem(db, { id: "pf-3", title: "P3", priority: "P3" });

    const items = listWorkItems(db, { all: true, priority: "P1,P3" });
    expect(items.length).toBe(2);
    expect(items.map(i => i.item_id)).toEqual(["pf-1", "pf-3"]);
  });

  test("filters by project", async () => {
    const { createWorkItem, listWorkItems } = await import("../src/work");
    const { registerProject } = await import("../src/project");

    registerProject(db, { id: "my-proj", name: "My Project" });
    createWorkItem(db, { id: "proj-1", title: "In project", project: "my-proj" });
    createWorkItem(db, { id: "proj-2", title: "No project" });

    const items = listWorkItems(db, { all: true, project: "my-proj" });
    expect(items.length).toBe(1);
    expect(items[0].item_id).toBe("proj-1");
  });

  test("returns empty array for no matches", async () => {
    const { listWorkItems } = await import("../src/work");
    const items = listWorkItems(db);
    expect(items).toEqual([]);
  });

  test("non-existent project returns empty array", async () => {
    const { listWorkItems } = await import("../src/work");
    const items = listWorkItems(db, { project: "no-such-project" });
    expect(items).toEqual([]);
  });

  test("throws on invalid status filter", async () => {
    const { listWorkItems } = await import("../src/work");
    expect(() => listWorkItems(db, { status: "bogus" })).toThrow("bogus");
  });

  test("throws on invalid priority filter", async () => {
    const { listWorkItems } = await import("../src/work");
    expect(() => listWorkItems(db, { priority: "P9" })).toThrow("P9");
  });
});

// F-10 T-2.1: getWorkItemStatus
describe("getWorkItemStatus", () => {
  test("returns item detail with event history", async () => {
    const { createWorkItem, claimWorkItem, getWorkItemStatus } = await import("../src/work");
    const { registerAgent } = await import("../src/agent");

    createWorkItem(db, { id: "detail-1", title: "Detail item", priority: "P1" });
    const agent = registerAgent(db, { name: "Claimer" });
    claimWorkItem(db, "detail-1", agent.session_id);

    const detail = getWorkItemStatus(db, "detail-1");
    expect(detail.item.item_id).toBe("detail-1");
    expect(detail.item.title).toBe("Detail item");
    expect(detail.item.status).toBe("claimed");
    expect(detail.item.priority).toBe("P1");

    expect(detail.history.length).toBeGreaterThanOrEqual(2);
    expect(detail.history[0].event_type).toBe("work_created");
    expect(detail.history[1].event_type).toBe("work_claimed");
  });

  test("returns empty history for unclaimed item", async () => {
    const { createWorkItem, getWorkItemStatus } = await import("../src/work");

    createWorkItem(db, { id: "no-hist", title: "No claim" });
    const detail = getWorkItemStatus(db, "no-hist");

    expect(detail.item.item_id).toBe("no-hist");
    expect(detail.history.length).toBe(1); // only work_created
    expect(detail.history[0].event_type).toBe("work_created");
  });

  test("throws on non-existent item", async () => {
    const { getWorkItemStatus } = await import("../src/work");
    expect(() => getWorkItemStatus(db, "ghost")).toThrow("ghost");
  });
});

// F-8 T-4.1: CLI E2E (claim)
describe("CLI work claim", () => {
  test("create-and-claim outputs JSON", async () => {
    // Register agent first
    const regProc = Bun.spawn(
      ["bun", "src/index.ts", "--db", dbPath, "--json", "agent", "register", "--name", "CLIAgent"],
      { cwd: PROJECT_ROOT, stdout: "pipe", stderr: "pipe" }
    );
    const regText = await new Response(regProc.stdout).text();
    await regProc.exited;
    const sessionId = JSON.parse(regText).session_id;

    // Create and claim
    const claimProc = Bun.spawn(
      ["bun", "src/index.ts", "--db", dbPath, "--json", "work", "claim",
       "--id", "cli-task", "--title", "CLI Task", "--session", sessionId, "--priority", "P1"],
      { cwd: PROJECT_ROOT, stdout: "pipe", stderr: "pipe" }
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
      { cwd: PROJECT_ROOT, stdout: "pipe", stderr: "pipe" }
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

// F-10 T-3.1: CLI E2E (list + status)
describe("CLI work list", () => {
  test("list outputs JSON array", async () => {
    // Create two items
    Bun.spawnSync(
      ["bun", "src/index.ts", "--db", dbPath, "--json", "work", "claim",
       "--id", "list-1", "--title", "First"],
      { cwd: PROJECT_ROOT }
    );
    Bun.spawnSync(
      ["bun", "src/index.ts", "--db", dbPath, "--json", "work", "claim",
       "--id", "list-2", "--title", "Second", "--priority", "P1"],
      { cwd: PROJECT_ROOT }
    );

    const proc = Bun.spawn(
      ["bun", "src/index.ts", "--db", dbPath, "--json", "work", "list"],
      { cwd: PROJECT_ROOT, stdout: "pipe", stderr: "pipe" }
    );
    const text = await new Response(proc.stdout).text();
    await proc.exited;

    const json = JSON.parse(text);
    expect(json.ok).toBe(true);
    expect(json.count).toBe(2);
    expect(json.items[0].item_id).toBe("list-2"); // P1 first
  });

  test("list with --status filter", async () => {
    // Create and claim one
    const regProc = Bun.spawn(
      ["bun", "src/index.ts", "--db", dbPath, "--json", "agent", "register", "--name", "ListAgent"],
      { cwd: PROJECT_ROOT, stdout: "pipe", stderr: "pipe" }
    );
    const regText = await new Response(regProc.stdout).text();
    await regProc.exited;
    const sid = JSON.parse(regText).session_id;

    Bun.spawnSync(
      ["bun", "src/index.ts", "--db", dbPath, "--json", "work", "claim",
       "--id", "ls-1", "--title", "Available"],
      { cwd: PROJECT_ROOT }
    );
    Bun.spawnSync(
      ["bun", "src/index.ts", "--db", dbPath, "--json", "work", "claim",
       "--id", "ls-2", "--title", "Claimed", "--session", sid],
      { cwd: PROJECT_ROOT }
    );

    const proc = Bun.spawn(
      ["bun", "src/index.ts", "--db", dbPath, "--json", "work", "list", "--status", "claimed"],
      { cwd: PROJECT_ROOT, stdout: "pipe", stderr: "pipe" }
    );
    const text = await new Response(proc.stdout).text();
    await proc.exited;

    const json = JSON.parse(text);
    expect(json.ok).toBe(true);
    expect(json.count).toBe(1);
    expect(json.items[0].item_id).toBe("ls-2");
  });
});

// F-9 T-1.1: releaseWorkItem
describe("releaseWorkItem", () => {
  test("releases a claimed item back to available", async () => {
    const { createWorkItem, claimWorkItem, releaseWorkItem } = await import("../src/work");
    const { registerAgent } = await import("../src/agent");

    createWorkItem(db, { id: "rel-1", title: "Releasable" });
    const agent = registerAgent(db, { name: "Releaser" });
    claimWorkItem(db, "rel-1", agent.session_id);

    const result = releaseWorkItem(db, "rel-1", agent.session_id);
    expect(result.item_id).toBe("rel-1");
    expect(result.released).toBe(true);
    expect(result.previous_status).toBe("claimed");

    const row = db.query("SELECT status, claimed_by, claimed_at FROM work_items WHERE item_id = ?").get("rel-1") as any;
    expect(row.status).toBe("available");
    expect(row.claimed_by).toBeNull();
    expect(row.claimed_at).toBeNull();
  });

  test("emits work_released event", async () => {
    const { createWorkItem, claimWorkItem, releaseWorkItem } = await import("../src/work");
    const { registerAgent } = await import("../src/agent");

    createWorkItem(db, { id: "rel-evt", title: "Release event" });
    const agent = registerAgent(db, { name: "Releaser" });
    claimWorkItem(db, "rel-evt", agent.session_id);
    releaseWorkItem(db, "rel-evt", agent.session_id);

    const event = db.query(
      "SELECT * FROM events WHERE event_type = 'work_released' AND target_id = ?"
    ).get("rel-evt") as any;
    expect(event).not.toBeNull();
    expect(event.actor_id).toBe(agent.session_id);
  });

  test("throws on non-existent item", async () => {
    const { releaseWorkItem } = await import("../src/work");
    const { registerAgent } = await import("../src/agent");
    const agent = registerAgent(db, { name: "Releaser" });
    expect(() => releaseWorkItem(db, "ghost", agent.session_id)).toThrow("ghost");
  });

  test("throws on non-existent session", async () => {
    const { createWorkItem, claimWorkItem, releaseWorkItem } = await import("../src/work");
    const { registerAgent } = await import("../src/agent");
    createWorkItem(db, { id: "rel-bad-sess", title: "Bad session" });
    const agent = registerAgent(db, { name: "Claimer" });
    claimWorkItem(db, "rel-bad-sess", agent.session_id);
    expect(() => releaseWorkItem(db, "rel-bad-sess", "fake-session")).toThrow("fake-session");
  });

  test("throws when item not claimed", async () => {
    const { createWorkItem, releaseWorkItem } = await import("../src/work");
    const { registerAgent } = await import("../src/agent");
    createWorkItem(db, { id: "rel-avail", title: "Available" });
    const agent = registerAgent(db, { name: "Releaser" });
    expect(() => releaseWorkItem(db, "rel-avail", agent.session_id)).toThrow();
  });

  test("throws when claimed by different session", async () => {
    const { createWorkItem, claimWorkItem, releaseWorkItem } = await import("../src/work");
    const { registerAgent } = await import("../src/agent");
    createWorkItem(db, { id: "rel-other", title: "Other agent" });
    const a1 = registerAgent(db, { name: "A1" });
    const a2 = registerAgent(db, { name: "A2" });
    claimWorkItem(db, "rel-other", a1.session_id);
    expect(() => releaseWorkItem(db, "rel-other", a2.session_id)).toThrow();
  });
});

// F-9 T-1.2: completeWorkItem
describe("completeWorkItem", () => {
  test("marks a claimed item as completed", async () => {
    const { createWorkItem, claimWorkItem, completeWorkItem } = await import("../src/work");
    const { registerAgent } = await import("../src/agent");

    createWorkItem(db, { id: "comp-1", title: "Completable" });
    const agent = registerAgent(db, { name: "Completer" });
    claimWorkItem(db, "comp-1", agent.session_id);

    const result = completeWorkItem(db, "comp-1", agent.session_id);
    expect(result.item_id).toBe("comp-1");
    expect(result.completed).toBe(true);
    expect(result.completed_at).toBeTruthy();
    expect(result.claimed_by).toBe(agent.session_id);

    const row = db.query("SELECT status, claimed_by, completed_at FROM work_items WHERE item_id = ?").get("comp-1") as any;
    expect(row.status).toBe("completed");
    expect(row.claimed_by).toBe(agent.session_id); // retained for history
    expect(row.completed_at).toBeTruthy();
  });

  test("emits work_completed event", async () => {
    const { createWorkItem, claimWorkItem, completeWorkItem } = await import("../src/work");
    const { registerAgent } = await import("../src/agent");

    createWorkItem(db, { id: "comp-evt", title: "Complete event" });
    const agent = registerAgent(db, { name: "Completer" });
    claimWorkItem(db, "comp-evt", agent.session_id);
    completeWorkItem(db, "comp-evt", agent.session_id);

    const event = db.query(
      "SELECT * FROM events WHERE event_type = 'work_completed' AND target_id = ?"
    ).get("comp-evt") as any;
    expect(event).not.toBeNull();
    expect(event.actor_id).toBe(agent.session_id);
  });

  test("throws on already completed item", async () => {
    const { createWorkItem, claimWorkItem, completeWorkItem } = await import("../src/work");
    const { registerAgent } = await import("../src/agent");

    createWorkItem(db, { id: "comp-dup", title: "Already done" });
    const agent = registerAgent(db, { name: "Completer" });
    claimWorkItem(db, "comp-dup", agent.session_id);
    completeWorkItem(db, "comp-dup", agent.session_id);
    expect(() => completeWorkItem(db, "comp-dup", agent.session_id)).toThrow();
  });

  test("throws when claimed by different session", async () => {
    const { createWorkItem, claimWorkItem, completeWorkItem } = await import("../src/work");
    const { registerAgent } = await import("../src/agent");
    createWorkItem(db, { id: "comp-other", title: "Other agent" });
    const a1 = registerAgent(db, { name: "A1" });
    const a2 = registerAgent(db, { name: "A2" });
    claimWorkItem(db, "comp-other", a1.session_id);
    expect(() => completeWorkItem(db, "comp-other", a2.session_id)).toThrow();
  });
});

// F-9 T-2.1: blockWorkItem and unblockWorkItem
describe("blockWorkItem", () => {
  test("blocks an available item", async () => {
    const { createWorkItem, blockWorkItem } = await import("../src/work");

    createWorkItem(db, { id: "blk-1", title: "Blockable" });
    const result = blockWorkItem(db, "blk-1", { blockedBy: "other-task" });

    expect(result.item_id).toBe("blk-1");
    expect(result.blocked).toBe(true);
    expect(result.blocked_by).toBe("other-task");
    expect(result.previous_status).toBe("available");

    const row = db.query("SELECT status, blocked_by FROM work_items WHERE item_id = ?").get("blk-1") as any;
    expect(row.status).toBe("blocked");
    expect(row.blocked_by).toBe("other-task");
  });

  test("blocks a claimed item retaining claimed_by", async () => {
    const { createWorkItem, claimWorkItem, blockWorkItem } = await import("../src/work");
    const { registerAgent } = await import("../src/agent");

    createWorkItem(db, { id: "blk-claimed", title: "Claimed block" });
    const agent = registerAgent(db, { name: "Blocker" });
    claimWorkItem(db, "blk-claimed", agent.session_id);
    const result = blockWorkItem(db, "blk-claimed");

    expect(result.blocked).toBe(true);
    expect(result.previous_status).toBe("claimed");

    const row = db.query("SELECT status, claimed_by FROM work_items WHERE item_id = ?").get("blk-claimed") as any;
    expect(row.status).toBe("blocked");
    expect(row.claimed_by).toBe(agent.session_id); // retained
  });

  test("emits work_blocked event", async () => {
    const { createWorkItem, blockWorkItem } = await import("../src/work");
    createWorkItem(db, { id: "blk-evt", title: "Block event" });
    blockWorkItem(db, "blk-evt");

    const event = db.query(
      "SELECT * FROM events WHERE event_type = 'work_blocked' AND target_id = ?"
    ).get("blk-evt") as any;
    expect(event).not.toBeNull();
  });

  test("throws on completed item", async () => {
    const { createWorkItem, claimWorkItem, completeWorkItem, blockWorkItem } = await import("../src/work");
    const { registerAgent } = await import("../src/agent");

    createWorkItem(db, { id: "blk-done", title: "Done" });
    const agent = registerAgent(db, { name: "Agent" });
    claimWorkItem(db, "blk-done", agent.session_id);
    completeWorkItem(db, "blk-done", agent.session_id);
    expect(() => blockWorkItem(db, "blk-done")).toThrow();
  });
});

describe("unblockWorkItem", () => {
  test("unblocks to available when no claimed_by", async () => {
    const { createWorkItem, blockWorkItem, unblockWorkItem } = await import("../src/work");

    createWorkItem(db, { id: "unblk-1", title: "Unblockable" });
    blockWorkItem(db, "unblk-1", { blockedBy: "dep" });
    const result = unblockWorkItem(db, "unblk-1");

    expect(result.item_id).toBe("unblk-1");
    expect(result.unblocked).toBe(true);
    expect(result.restored_status).toBe("available");

    const row = db.query("SELECT status, blocked_by FROM work_items WHERE item_id = ?").get("unblk-1") as any;
    expect(row.status).toBe("available");
    expect(row.blocked_by).toBeNull();
  });

  test("unblocks to claimed when claimed_by is set", async () => {
    const { createWorkItem, claimWorkItem, blockWorkItem, unblockWorkItem } = await import("../src/work");
    const { registerAgent } = await import("../src/agent");

    createWorkItem(db, { id: "unblk-claimed", title: "Claimed unblock" });
    const agent = registerAgent(db, { name: "Agent" });
    claimWorkItem(db, "unblk-claimed", agent.session_id);
    blockWorkItem(db, "unblk-claimed");
    const result = unblockWorkItem(db, "unblk-claimed");

    expect(result.restored_status).toBe("claimed");

    const row = db.query("SELECT status, claimed_by FROM work_items WHERE item_id = ?").get("unblk-claimed") as any;
    expect(row.status).toBe("claimed");
    expect(row.claimed_by).toBe(agent.session_id);
  });

  test("throws when item is not blocked", async () => {
    const { createWorkItem, unblockWorkItem } = await import("../src/work");
    createWorkItem(db, { id: "unblk-avail", title: "Not blocked" });
    expect(() => unblockWorkItem(db, "unblk-avail")).toThrow();
  });
});

// F-9 T-3.1/T-3.2: CLI E2E
describe("CLI work release", () => {
  test("release outputs JSON", async () => {
    const regProc = Bun.spawn(
      ["bun", "src/index.ts", "--db", dbPath, "--json", "agent", "register", "--name", "CLIReleaser"],
      { cwd: PROJECT_ROOT, stdout: "pipe", stderr: "pipe" }
    );
    const regText = await new Response(regProc.stdout).text();
    await regProc.exited;
    const sid = JSON.parse(regText).session_id;

    Bun.spawnSync(
      ["bun", "src/index.ts", "--db", dbPath, "--json", "work", "claim",
       "--id", "cli-rel", "--title", "CLI Release", "--session", sid],
      { cwd: PROJECT_ROOT }
    );

    const proc = Bun.spawn(
      ["bun", "src/index.ts", "--db", dbPath, "--json", "work", "release",
       "--id", "cli-rel", "--session", sid],
      { cwd: PROJECT_ROOT, stdout: "pipe", stderr: "pipe" }
    );
    const text = await new Response(proc.stdout).text();
    await proc.exited;

    const json = JSON.parse(text);
    expect(json.ok).toBe(true);
    expect(json.item_id).toBe("cli-rel");
    expect(json.released).toBe(true);
  });
});

describe("CLI work complete", () => {
  test("complete outputs JSON", async () => {
    const regProc = Bun.spawn(
      ["bun", "src/index.ts", "--db", dbPath, "--json", "agent", "register", "--name", "CLICompleter"],
      { cwd: PROJECT_ROOT, stdout: "pipe", stderr: "pipe" }
    );
    const regText = await new Response(regProc.stdout).text();
    await regProc.exited;
    const sid = JSON.parse(regText).session_id;

    Bun.spawnSync(
      ["bun", "src/index.ts", "--db", dbPath, "--json", "work", "claim",
       "--id", "cli-comp", "--title", "CLI Complete", "--session", sid],
      { cwd: PROJECT_ROOT }
    );

    const proc = Bun.spawn(
      ["bun", "src/index.ts", "--db", dbPath, "--json", "work", "complete",
       "--id", "cli-comp", "--session", sid],
      { cwd: PROJECT_ROOT, stdout: "pipe", stderr: "pipe" }
    );
    const text = await new Response(proc.stdout).text();
    await proc.exited;

    const json = JSON.parse(text);
    expect(json.ok).toBe(true);
    expect(json.item_id).toBe("cli-comp");
    expect(json.completed).toBe(true);
  });
});

describe("CLI work block/unblock", () => {
  test("block and unblock output JSON", async () => {
    Bun.spawnSync(
      ["bun", "src/index.ts", "--db", dbPath, "--json", "work", "claim",
       "--id", "cli-blk", "--title", "CLI Block"],
      { cwd: PROJECT_ROOT }
    );

    const blockProc = Bun.spawn(
      ["bun", "src/index.ts", "--db", dbPath, "--json", "work", "block",
       "--id", "cli-blk", "--blocked-by", "other-item"],
      { cwd: PROJECT_ROOT, stdout: "pipe", stderr: "pipe" }
    );
    const blockText = await new Response(blockProc.stdout).text();
    await blockProc.exited;

    const blockJson = JSON.parse(blockText);
    expect(blockJson.ok).toBe(true);
    expect(blockJson.item_id).toBe("cli-blk");
    expect(blockJson.blocked).toBe(true);

    const unblockProc = Bun.spawn(
      ["bun", "src/index.ts", "--db", dbPath, "--json", "work", "unblock",
       "--id", "cli-blk"],
      { cwd: PROJECT_ROOT, stdout: "pipe", stderr: "pipe" }
    );
    const unblockText = await new Response(unblockProc.stdout).text();
    await unblockProc.exited;

    const unblockJson = JSON.parse(unblockText);
    expect(unblockJson.ok).toBe(true);
    expect(unblockJson.item_id).toBe("cli-blk");
    expect(unblockJson.unblocked).toBe(true);
  });
});

describe("CLI work status", () => {
  test("status outputs JSON detail", async () => {
    Bun.spawnSync(
      ["bun", "src/index.ts", "--db", dbPath, "--json", "work", "claim",
       "--id", "stat-1", "--title", "Status Test"],
      { cwd: PROJECT_ROOT }
    );

    const proc = Bun.spawn(
      ["bun", "src/index.ts", "--db", dbPath, "--json", "work", "status", "stat-1"],
      { cwd: PROJECT_ROOT, stdout: "pipe", stderr: "pipe" }
    );
    const text = await new Response(proc.stdout).text();
    await proc.exited;

    const json = JSON.parse(text);
    expect(json.ok).toBe(true);
    expect(json.item_id).toBe("stat-1");
    expect(json.title).toBe("Status Test");
    expect(json.history).toBeArray();
    expect(json.history.length).toBeGreaterThanOrEqual(1);
  });
});
