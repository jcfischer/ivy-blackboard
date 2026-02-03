import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDatabase, closeDatabase } from "../src/db";
import { resetConfigCache } from "../src/config";
import type { Database } from "bun:sqlite";
import type { Server } from "bun";

let db: Database;
let dbPath: string;
let tmpDir: string;
let server: Server | null = null;

beforeEach(() => {
  tmpDir = join(tmpdir(), `bb-server-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  dbPath = join(tmpDir, "test.db");
  resetConfigCache();
  db = openDatabase(dbPath);
});

afterEach(() => {
  if (server) {
    server.stop(true);
    server = null;
  }
  closeDatabase(db);
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("createServer", () => {
  test("starts server on specified port", async () => {
    const { createServer } = await import("../src/server");
    server = createServer(db, dbPath, 0); // port 0 = random available port
    expect(server.port).toBeGreaterThan(0);
  });

  test("GET / returns HTML", async () => {
    const { createServer } = await import("../src/server");
    server = createServer(db, dbPath, 0);
    const res = await fetch(`http://localhost:${server.port}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const text = await res.text();
    expect(text).toContain("Blackboard");
  });

  test("GET /api/status returns JSON envelope", async () => {
    const { createServer } = await import("../src/server");
    server = createServer(db, dbPath, 0);
    const res = await fetch(`http://localhost:${server.port}/api/status`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.database).toBe(dbPath);
    expect(json.database_size).toBeTruthy();
    expect(typeof json.projects).toBe("number");
  });

  test("GET /api/agents returns agent list", async () => {
    const { createServer } = await import("../src/server");
    const { registerAgent } = await import("../src/agent");
    registerAgent(db, { name: "TestAgent" });

    server = createServer(db, dbPath, 0);
    const res = await fetch(`http://localhost:${server.port}/api/agents`);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.count).toBe(1);
    expect(json.items[0].agent_name).toBe("TestAgent");
  });

  test("GET /api/work returns work items", async () => {
    const { createServer } = await import("../src/server");
    const { createWorkItem } = await import("../src/work");
    createWorkItem(db, { id: "srv-w1", title: "Server Task" });

    server = createServer(db, dbPath, 0);
    const res = await fetch(`http://localhost:${server.port}/api/work`);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.count).toBe(1);
    expect(json.items[0].title).toBe("Server Task");
  });

  test("GET /api/events returns events", async () => {
    const { createServer } = await import("../src/server");
    const { registerAgent } = await import("../src/agent");
    registerAgent(db, { name: "EventAgent" });

    server = createServer(db, dbPath, 0);
    const res = await fetch(`http://localhost:${server.port}/api/events`);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.count).toBeGreaterThan(0);
  });

  test("GET /api/events?filter= filters by type", async () => {
    const { createServer } = await import("../src/server");
    const { registerAgent } = await import("../src/agent");
    registerAgent(db, { name: "FilterAgent" });

    server = createServer(db, dbPath, 0);
    const res = await fetch(
      `http://localhost:${server.port}/api/events?filter=agent_registered`
    );
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.items.every((e: any) => e.event_type === "agent_registered")).toBe(true);
  });

  test("GET /api/projects returns project list", async () => {
    const { createServer } = await import("../src/server");
    const { registerProject } = await import("../src/project");
    registerProject(db, { id: "srv-p1", name: "Server Project" });

    server = createServer(db, dbPath, 0);
    const res = await fetch(`http://localhost:${server.port}/api/projects`);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.count).toBe(1);
    expect(json.items[0].project_id).toBe("srv-p1");
  });

  test("GET /unknown returns 404", async () => {
    const { createServer } = await import("../src/server");
    server = createServer(db, dbPath, 0);
    const res = await fetch(`http://localhost:${server.port}/nonexistent`);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  test("OPTIONS returns CORS headers", async () => {
    const { createServer } = await import("../src/server");
    server = createServer(db, dbPath, 0);
    const res = await fetch(`http://localhost:${server.port}/api/status`, {
      method: "OPTIONS",
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  test("handles invalid filter gracefully", async () => {
    const { createServer } = await import("../src/server");
    server = createServer(db, dbPath, 0);
    const res = await fetch(
      `http://localhost:${server.port}/api/events?filter=bad_type`
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toContain("Invalid event type");
  });
});
