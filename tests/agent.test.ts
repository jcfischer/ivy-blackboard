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
  tmpDir = join(tmpdir(), `bb-agent-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  dbPath = join(tmpDir, "test.db");
  resetConfigCache();
  db = openDatabase(dbPath);
});

afterEach(() => {
  closeDatabase(db);
  rmSync(tmpDir, { recursive: true, force: true });
});

// T-1.1: Core registerAgent
describe("registerAgent", () => {
  test("creates agent row with UUID session_id", async () => {
    const { registerAgent } = await import("../src/agent");
    const result = registerAgent(db, { name: "Ivy" });

    expect(result.session_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(result.agent_name).toBe("Ivy");
    expect(result.status).toBe("active");
    expect(result.pid).toBe(process.pid);
    expect(result.parent_id).toBeNull();
  });

  test("stores agent in database", async () => {
    const { registerAgent } = await import("../src/agent");
    const result = registerAgent(db, { name: "Ivy", project: "pai-collab", work: "Designing schema" });

    const row = db.query("SELECT * FROM agents WHERE session_id = ?").get(result.session_id) as any;
    expect(row).not.toBeNull();
    expect(row.agent_name).toBe("Ivy");
    expect(row.project).toBe("pai-collab");
    expect(row.current_work).toBe("Designing schema");
    expect(row.status).toBe("active");
    expect(row.pid).toBe(process.pid);
  });

  test("sets started_at and last_seen_at to ISO 8601", async () => {
    const { registerAgent } = await import("../src/agent");
    const before = new Date().toISOString();
    const result = registerAgent(db, { name: "Ivy" });
    const after = new Date().toISOString();

    expect(result.started_at >= before).toBe(true);
    expect(result.started_at <= after).toBe(true);
  });

  test("emits agent_registered event", async () => {
    const { registerAgent } = await import("../src/agent");
    const result = registerAgent(db, { name: "Ivy", project: "pai-collab" });

    const event = db.query(
      "SELECT * FROM events WHERE event_type = 'agent_registered' AND actor_id = ?"
    ).get(result.session_id) as any;

    expect(event).not.toBeNull();
    expect(event.target_id).toBe(result.session_id);
    expect(event.target_type).toBe("agent");
    expect(event.summary).toContain("Ivy");
    expect(event.summary).toContain("pai-collab");
  });

  test("handles optional fields as null", async () => {
    const { registerAgent } = await import("../src/agent");
    const result = registerAgent(db, { name: "Ivy" });

    expect(result.project).toBeNull();
    expect(result.current_work).toBeNull();
    expect(result.parent_id).toBeNull();
  });
});

// T-1.2: Delegate registration
describe("registerAgent delegates", () => {
  test("links delegate to parent via parent_id", async () => {
    const { registerAgent } = await import("../src/agent");
    const parent = registerAgent(db, { name: "Ivy" });
    const delegate = registerAgent(db, {
      name: "Ivy (delegate)",
      parentId: parent.session_id,
      project: "pai-scanning",
    });

    expect(delegate.parent_id).toBe(parent.session_id);

    const row = db.query("SELECT parent_id FROM agents WHERE session_id = ?").get(delegate.session_id) as any;
    expect(row.parent_id).toBe(parent.session_id);
  });

  test("throws on invalid parent_id (FK violation)", async () => {
    const { registerAgent } = await import("../src/agent");

    expect(() =>
      registerAgent(db, { name: "Orphan", parentId: "nonexistent-session" })
    ).toThrow();
  });

  test("delegate event summary includes delegate designation", async () => {
    const { registerAgent } = await import("../src/agent");
    const parent = registerAgent(db, { name: "Ivy" });
    const delegate = registerAgent(db, {
      name: "Ivy (delegate)",
      parentId: parent.session_id,
    });

    const event = db.query(
      "SELECT summary FROM events WHERE event_type = 'agent_registered' AND actor_id = ?"
    ).get(delegate.session_id) as any;

    expect(event.summary).toContain("delegate");
  });
});

// T-2.1: Core deregisterAgent
describe("deregisterAgent", () => {
  test("sets agent status to completed", async () => {
    const { registerAgent, deregisterAgent } = await import("../src/agent");
    const agent = registerAgent(db, { name: "Ivy" });
    const result = deregisterAgent(db, agent.session_id);

    expect(result.session_id).toBe(agent.session_id);
    expect(result.agent_name).toBe("Ivy");

    const row = db.query("SELECT status FROM agents WHERE session_id = ?").get(agent.session_id) as any;
    expect(row.status).toBe("completed");
  });

  test("returns session duration in seconds", async () => {
    const { registerAgent, deregisterAgent } = await import("../src/agent");
    const agent = registerAgent(db, { name: "Ivy" });
    const result = deregisterAgent(db, agent.session_id);

    expect(result.duration_seconds).toBeGreaterThanOrEqual(0);
  });

  test("releases claimed work items", async () => {
    const { registerAgent, deregisterAgent } = await import("../src/agent");
    const agent = registerAgent(db, { name: "Ivy" });

    // Insert a work item claimed by this agent
    db.query(`
      INSERT INTO work_items (item_id, title, source, status, priority, claimed_by, claimed_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run("work-1", "Test task", "local", "claimed", "P1", agent.session_id, new Date().toISOString(), new Date().toISOString());

    const result = deregisterAgent(db, agent.session_id);
    expect(result.released_count).toBe(1);

    const item = db.query("SELECT status, claimed_by FROM work_items WHERE item_id = 'work-1'").get() as any;
    expect(item.status).toBe("available");
    expect(item.claimed_by).toBeNull();
  });

  test("emits agent_deregistered event", async () => {
    const { registerAgent, deregisterAgent } = await import("../src/agent");
    const agent = registerAgent(db, { name: "Ivy" });
    deregisterAgent(db, agent.session_id);

    const event = db.query(
      "SELECT * FROM events WHERE event_type = 'agent_deregistered' AND actor_id = ?"
    ).get(agent.session_id) as any;

    expect(event).not.toBeNull();
    expect(event.summary).toContain("Ivy");
  });

  test("throws on non-existent session", async () => {
    const { deregisterAgent } = await import("../src/agent");

    expect(() => deregisterAgent(db, "nonexistent")).toThrow("nonexistent");
  });

  test("is idempotent for already-completed agent", async () => {
    const { registerAgent, deregisterAgent } = await import("../src/agent");
    const agent = registerAgent(db, { name: "Ivy" });
    deregisterAgent(db, agent.session_id);

    // Second deregister should not throw
    const result = deregisterAgent(db, agent.session_id);
    expect(result.session_id).toBe(agent.session_id);
    expect(result.released_count).toBe(0);
  });
});

// T-3.1 + T-3.2: CLI commands (E2E via subprocess)
describe("CLI agent register", () => {
  test("register --name outputs session details as JSON", async () => {
    const proc = Bun.spawn(
      ["bun", "src/index.ts", "--db", dbPath, "--json", "agent", "register", "--name", "TestAgent"],
      { cwd: "/Users/fischer/work/ivy-blackboard", stdout: "pipe", stderr: "pipe" }
    );
    const text = await new Response(proc.stdout).text();
    await proc.exited;

    const json = JSON.parse(text);
    expect(json.ok).toBe(true);
    expect(json.agent_name).toBe("TestAgent");
    expect(json.session_id).toBeTruthy();
    expect(json.status).toBe("active");
  });

  test("deregister --session outputs result as JSON", async () => {
    // First register
    const regProc = Bun.spawn(
      ["bun", "src/index.ts", "--db", dbPath, "--json", "agent", "register", "--name", "TestAgent"],
      { cwd: "/Users/fischer/work/ivy-blackboard", stdout: "pipe", stderr: "pipe" }
    );
    const regText = await new Response(regProc.stdout).text();
    await regProc.exited;
    const sessionId = JSON.parse(regText).session_id;

    // Then deregister
    const deregProc = Bun.spawn(
      ["bun", "src/index.ts", "--db", dbPath, "--json", "agent", "deregister", "--session", sessionId],
      { cwd: "/Users/fischer/work/ivy-blackboard", stdout: "pipe", stderr: "pipe" }
    );
    const deregText = await new Response(deregProc.stdout).text();
    await deregProc.exited;

    const json = JSON.parse(deregText);
    expect(json.ok).toBe(true);
    expect(json.session_id).toBe(sessionId);
    expect(json.agent_name).toBe("TestAgent");
    expect(json.released_count).toBe(0);
    expect(typeof json.duration_seconds).toBe("number");
  });
});
