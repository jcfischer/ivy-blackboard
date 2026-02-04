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
  tmpDir = join(tmpdir(), `bb-dashboard-test-${Date.now()}`);
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

describe("dashboard HTML", () => {
  test("GET / serves dashboard with correct structure", async () => {
    const { createServer } = await import("../src/server");
    server = createServer(db, dbPath, 0);

    const res = await fetch(`http://localhost:${server.port}/`);
    expect(res.status).toBe(200);
    const html = await res.text();

    expect(html).toContain("Blackboard Dashboard");
    expect(html).toContain("Agents");
    expect(html).toContain("Work Items");
    expect(html).toContain("Recent Events");
    expect(html).toContain("/api/status");
    expect(html).toContain("/api/agents");
    expect(html).toContain("/api/work");
    expect(html).toContain("/api/events");
  });

  test("dashboard has work tabs for active and history views", async () => {
    const { createServer } = await import("../src/server");
    server = createServer(db, dbPath, 0);

    const res = await fetch(`http://localhost:${server.port}/`);
    const html = await res.text();

    expect(html).toContain("work-tabs");
    expect(html).toContain("switchWorkTab('active')");
    expect(html).toContain("switchWorkTab('history')");
    expect(html).toContain("Active");
    expect(html).toContain("History");
  });

  test("dashboard has work detail panel", async () => {
    const { createServer } = await import("../src/server");
    server = createServer(db, dbPath, 0);

    const res = await fetch(`http://localhost:${server.port}/`);
    const html = await res.text();

    expect(html).toContain("work-detail-panel");
    expect(html).toContain("work-detail-body");
    expect(html).toContain("selectWork");
    expect(html).toContain("closeWorkDetail");
    expect(html).toContain("/api/work/");
  });

  test("dashboard HTML includes auto-refresh", async () => {
    const { createServer } = await import("../src/server");
    server = createServer(db, dbPath, 0);

    const res = await fetch(`http://localhost:${server.port}/`);
    const html = await res.text();

    expect(html).toContain("setInterval");
    expect(html).toContain("5000");
  });

  test("dashboard has proper meta tags", async () => {
    const { createServer } = await import("../src/server");
    server = createServer(db, dbPath, 0);

    const res = await fetch(`http://localhost:${server.port}/`);
    const html = await res.text();

    expect(html).toContain('charset="UTF-8"');
    expect(html).toContain("viewport");
  });

  test("dashboard integration: API endpoints return data shown in UI", async () => {
    const { createServer } = await import("../src/server");
    const { registerAgent } = await import("../src/agent");
    const { createWorkItem } = await import("../src/work");

    registerAgent(db, { name: "DashAgent" });
    createWorkItem(db, { id: "dash-w1", title: "Dash Task" });

    server = createServer(db, dbPath, 0);

    // Verify API serves data that dashboard would consume
    const [agentsRes, workRes, statusRes] = await Promise.all([
      fetch(`http://localhost:${server.port}/api/agents`),
      fetch(`http://localhost:${server.port}/api/work`),
      fetch(`http://localhost:${server.port}/api/status`),
    ]);

    const agents = await agentsRes.json();
    expect(agents.count).toBe(1);
    expect(agents.items[0].agent_name).toBe("DashAgent");

    const work = await workRes.json();
    expect(work.count).toBe(1);
    expect(work.items[0].title).toBe("Dash Task");

    const status = await statusRes.json();
    expect(status.agents.active).toBe(1);
  });
});
