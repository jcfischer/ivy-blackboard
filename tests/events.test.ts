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
  tmpDir = join(tmpdir(), `bb-events-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  dbPath = join(tmpDir, "test.db");
  resetConfigCache();
  db = openDatabase(dbPath);
});

afterEach(() => {
  closeDatabase(db);
  rmSync(tmpDir, { recursive: true, force: true });
});

// T-1.1: parseDuration
describe("parseDuration", () => {
  test("parses seconds", async () => {
    const { parseDuration } = await import("../src/events");
    expect(parseDuration("30s")).toBe(30);
  });

  test("parses minutes", async () => {
    const { parseDuration } = await import("../src/events");
    expect(parseDuration("5m")).toBe(300);
  });

  test("parses hours", async () => {
    const { parseDuration } = await import("../src/events");
    expect(parseDuration("2h")).toBe(7200);
  });

  test("parses days", async () => {
    const { parseDuration } = await import("../src/events");
    expect(parseDuration("1d")).toBe(86400);
  });

  test("throws on invalid format", async () => {
    const { parseDuration } = await import("../src/events");
    expect(() => parseDuration("abc")).toThrow("Invalid duration");
    expect(() => parseDuration("1x")).toThrow("Invalid duration");
    expect(() => parseDuration("")).toThrow("Invalid duration");
  });
});

// T-1.1: observeEvents
describe("observeEvents", () => {
  function insertEvent(
    db: Database,
    type: string,
    actorId: string | null,
    summary: string,
    offsetSeconds: number = 0
  ) {
    const ts = new Date(Date.now() - offsetSeconds * 1000).toISOString();
    db.query(
      "INSERT INTO events (timestamp, event_type, actor_id, target_id, target_type, summary) VALUES (?, ?, ?, NULL, 'agent', ?)"
    ).run(ts, type, actorId, summary);
  }

  test("returns events ordered by timestamp DESC by default (most recent first)", async () => {
    const { observeEvents } = await import("../src/events");
    insertEvent(db, "agent_registered", "sess-1", "Agent A registered", 120);
    insertEvent(db, "heartbeat_received", "sess-1", "Heartbeat", 60);
    insertEvent(db, "agent_deregistered", "sess-1", "Agent A deregistered", 0);

    const events = observeEvents(db);
    expect(events.length).toBe(3);
    expect(events[0].event_type).toBe("agent_deregistered");
    expect(events[2].event_type).toBe("agent_registered");
  });

  test("returns events in ASC order when 'since' is provided", async () => {
    const { observeEvents } = await import("../src/events");
    insertEvent(db, "agent_registered", "sess-1", "Agent A registered", 120);
    insertEvent(db, "heartbeat_received", "sess-1", "Heartbeat", 60);
    insertEvent(db, "agent_deregistered", "sess-1", "Agent A deregistered", 0);

    const events = observeEvents(db, { since: "1h" });
    // With 'since', events are in ASC order (chronological for tailing)
    expect(events[0].event_type).toBe("agent_registered");
    expect(events[events.length - 1].event_type).toBe("agent_deregistered");
  });

  test("defaults to limit 50", async () => {
    const { observeEvents } = await import("../src/events");
    for (let i = 0; i < 60; i++) {
      insertEvent(db, "heartbeat_received", `sess-${i}`, `Beat ${i}`, 60 - i);
    }
    const events = observeEvents(db);
    expect(events.length).toBe(50);
  });

  test("respects custom limit", async () => {
    const { observeEvents } = await import("../src/events");
    for (let i = 0; i < 10; i++) {
      insertEvent(db, "heartbeat_received", `sess-${i}`, `Beat ${i}`);
    }
    const events = observeEvents(db, { limit: 3 });
    expect(events.length).toBe(3);
  });

  test("filters by --since duration", async () => {
    const { observeEvents } = await import("../src/events");
    insertEvent(db, "agent_registered", "sess-old", "Old event", 7200); // 2h ago
    insertEvent(db, "agent_registered", "sess-new", "New event", 30);   // 30s ago

    const events = observeEvents(db, { since: "1h" });
    expect(events.length).toBe(1);
    expect(events[0].summary).toBe("New event");
  });

  test("filters by --type", async () => {
    const { observeEvents } = await import("../src/events");
    insertEvent(db, "agent_registered", "sess-1", "Registered");
    insertEvent(db, "heartbeat_received", "sess-1", "Heartbeat");
    insertEvent(db, "agent_deregistered", "sess-1", "Deregistered");

    const events = observeEvents(db, { type: "agent_registered,agent_deregistered" });
    expect(events.length).toBe(2);
    expect(events.every(e => e.event_type !== "heartbeat_received")).toBe(true);
  });

  test("accepts arbitrary event types for filtering", async () => {
    const { observeEvents } = await import("../src/events");
    // Custom event types should not throw — downstream consumers define their own
    const events = observeEvents(db, { type: "custom_type" });
    expect(events).toEqual([]);
  });

  test("filters by --session prefix", async () => {
    const { observeEvents } = await import("../src/events");
    insertEvent(db, "agent_registered", "abc-123-456", "Agent A");
    insertEvent(db, "agent_registered", "def-789-012", "Agent B");

    const events = observeEvents(db, { session: "abc-123" });
    expect(events.length).toBe(1);
    expect(events[0].summary).toBe("Agent A");
  });

  test("filters by exact session ID", async () => {
    const { observeEvents } = await import("../src/events");
    insertEvent(db, "agent_registered", "exact-id", "Exact");
    insertEvent(db, "agent_registered", "exact-id-longer", "Longer");

    const events = observeEvents(db, { session: "exact-id" });
    // Should match both exact and prefix
    expect(events.length).toBe(2);
  });

  test("returns empty array when no events match", async () => {
    const { observeEvents } = await import("../src/events");
    const events = observeEvents(db, { type: "agent_registered" });
    expect(events).toEqual([]);
  });

  test("combines multiple filters with AND", async () => {
    const { observeEvents } = await import("../src/events");
    insertEvent(db, "agent_registered", "sess-1", "Registered", 30);
    insertEvent(db, "heartbeat_received", "sess-1", "Heartbeat", 30);
    insertEvent(db, "agent_registered", "sess-2", "Other agent", 7200); // 2h ago

    const events = observeEvents(db, { since: "1h", type: "agent_registered" });
    expect(events.length).toBe(1);
    expect(events[0].actor_id).toBe("sess-1");
  });
});

// T-2.1: formatTimeline
describe("formatTimeline", () => {
  test("formats events as timeline lines", async () => {
    const { formatTimeline } = await import("../src/output");
    const now = new Date().toISOString();
    const result = formatTimeline([
      { timestamp: now, event_type: "agent_registered", actor_id: "abc-123-456-789", summary: "Agent registered" },
    ]);
    expect(result).toContain("[just now]");
    expect(result).toContain("agent_registered");
    expect(result).toContain("[abc-123-456-");
    expect(result).toContain("Agent registered");
  });

  test("shows 'system' for null actor_id", async () => {
    const { formatTimeline } = await import("../src/output");
    const now = new Date().toISOString();
    const result = formatTimeline([
      { timestamp: now, event_type: "project_registered", actor_id: null, summary: "Project created" },
    ]);
    expect(result).toContain("[system]");
  });

  test("joins multiple events with newlines", async () => {
    const { formatTimeline } = await import("../src/output");
    const now = new Date().toISOString();
    const result = formatTimeline([
      { timestamp: now, event_type: "agent_registered", actor_id: "a", summary: "First" },
      { timestamp: now, event_type: "agent_deregistered", actor_id: "b", summary: "Second" },
    ]);
    const lines = result.split("\n");
    expect(lines.length).toBe(2);
  });
});

// T-3.1: CLI E2E
describe("CLI observe", () => {
  test("observe --json returns event envelope", async () => {
    // Register an agent first to generate events
    const regProc = Bun.spawn(
      ["bun", "src/index.ts", "--db", dbPath, "--json", "agent", "register", "--name", "Observer"],
      { cwd: PROJECT_ROOT, stdout: "pipe", stderr: "pipe" }
    );
    await new Response(regProc.stdout).text();
    await regProc.exited;

    const proc = Bun.spawn(
      ["bun", "src/index.ts", "--db", dbPath, "--json", "observe"],
      { cwd: PROJECT_ROOT, stdout: "pipe", stderr: "pipe" }
    );
    const text = await new Response(proc.stdout).text();
    await proc.exited;

    const json = JSON.parse(text);
    expect(json.ok).toBe(true);
    expect(json.count).toBeGreaterThan(0);
    expect(Array.isArray(json.items)).toBe(true);
  });

  test("observe --filter works in JSON mode", async () => {
    // Register an agent
    const regProc = Bun.spawn(
      ["bun", "src/index.ts", "--db", dbPath, "--json", "agent", "register", "--name", "Filtered"],
      { cwd: PROJECT_ROOT, stdout: "pipe", stderr: "pipe" }
    );
    await new Response(regProc.stdout).text();
    await regProc.exited;

    const proc = Bun.spawn(
      ["bun", "src/index.ts", "--db", dbPath, "--json", "observe", "--filter", "agent_registered"],
      { cwd: PROJECT_ROOT, stdout: "pipe", stderr: "pipe" }
    );
    const text = await new Response(proc.stdout).text();
    await proc.exited;

    const json = JSON.parse(text);
    expect(json.ok).toBe(true);
    expect(json.items.every((e: any) => e.event_type === "agent_registered")).toBe(true);
  });

  test("observe --limit limits results", async () => {
    // Register multiple agents to generate events
    for (let i = 0; i < 3; i++) {
      const p = Bun.spawn(
        ["bun", "src/index.ts", "--db", dbPath, "--json", "agent", "register", "--name", `Limit${i}`],
        { cwd: PROJECT_ROOT, stdout: "pipe", stderr: "pipe" }
      );
      await new Response(p.stdout).text();
      await p.exited;
    }

    const proc = Bun.spawn(
      ["bun", "src/index.ts", "--db", dbPath, "--json", "observe", "--limit", "2"],
      { cwd: PROJECT_ROOT, stdout: "pipe", stderr: "pipe" }
    );
    const text = await new Response(proc.stdout).text();
    await proc.exited;

    const json = JSON.parse(text);
    expect(json.ok).toBe(true);
    expect(json.count).toBe(2);
  });
});
