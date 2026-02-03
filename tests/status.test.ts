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
  tmpDir = join(tmpdir(), `bb-status-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  dbPath = join(tmpDir, "test.db");
  resetConfigCache();
  db = openDatabase(dbPath);
});

afterEach(() => {
  closeDatabase(db);
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("formatSize", () => {
  test("formats bytes", async () => {
    const { formatSize } = await import("../src/status");
    expect(formatSize(512)).toBe("512 B");
  });

  test("formats kilobytes", async () => {
    const { formatSize } = await import("../src/status");
    expect(formatSize(2048)).toBe("2.0 KB");
  });

  test("formats megabytes", async () => {
    const { formatSize } = await import("../src/status");
    expect(formatSize(1536 * 1024)).toBe("1.5 MB");
  });

  test("formats gigabytes", async () => {
    const { formatSize } = await import("../src/status");
    expect(formatSize(2 * 1024 * 1024 * 1024)).toBe("2.0 GB");
  });
});

describe("getOverallStatus", () => {
  test("returns correct structure on empty database", async () => {
    const { getOverallStatus } = await import("../src/status");
    const status = getOverallStatus(db, dbPath);

    expect(status.database).toBe(dbPath);
    expect(status.database_size).not.toBe("unknown");
    expect(status.agents).toEqual({});
    expect(status.projects).toBe(0);
    expect(status.work_items).toEqual({});
    expect(status.events_24h).toBe(0);
    expect(status.active_agents).toEqual([]);
  });

  test("counts agents by status", async () => {
    const { getOverallStatus } = await import("../src/status");
    const { registerAgent, deregisterAgent } = await import("../src/agent");

    registerAgent(db, { name: "Active1" });
    registerAgent(db, { name: "Active2" });
    const done = registerAgent(db, { name: "Done" });
    deregisterAgent(db, done.session_id);

    const status = getOverallStatus(db, dbPath);
    expect(status.agents.active).toBe(2);
    expect(status.agents.completed).toBe(1);
  });

  test("counts work items by status", async () => {
    const { getOverallStatus } = await import("../src/status");
    const { createWorkItem } = await import("../src/work");
    const { registerAgent } = await import("../src/agent");
    const { claimWorkItem } = await import("../src/work");

    createWorkItem(db, { id: "w1", title: "Available" });
    createWorkItem(db, { id: "w2", title: "Claimed" });
    const agent = registerAgent(db, { name: "Worker" });
    claimWorkItem(db, "w2", agent.session_id);

    const status = getOverallStatus(db, dbPath);
    expect(status.work_items.available).toBe(1);
    expect(status.work_items.claimed).toBe(1);
  });

  test("counts projects", async () => {
    const { getOverallStatus } = await import("../src/status");
    const { registerProject } = await import("../src/project");

    registerProject(db, { id: "p1", name: "Project 1" });
    registerProject(db, { id: "p2", name: "Project 2" });

    const status = getOverallStatus(db, dbPath);
    expect(status.projects).toBe(2);
  });

  test("counts events in last 24h", async () => {
    const { getOverallStatus } = await import("../src/status");
    const { registerAgent } = await import("../src/agent");

    // Register agents creates events
    registerAgent(db, { name: "Agent1" });
    registerAgent(db, { name: "Agent2" });

    const status = getOverallStatus(db, dbPath);
    expect(status.events_24h).toBe(2);
  });

  test("lists only active agents", async () => {
    const { getOverallStatus } = await import("../src/status");
    const { registerAgent, deregisterAgent } = await import("../src/agent");

    registerAgent(db, { name: "Active", project: "proj-1" });
    const done = registerAgent(db, { name: "Done" });
    deregisterAgent(db, done.session_id);

    const status = getOverallStatus(db, dbPath);
    expect(status.active_agents.length).toBe(1);
    expect(status.active_agents[0].agent_name).toBe("Active");
    expect(status.active_agents[0].project).toBe("proj-1");
  });

  test("returns 'unknown' for missing database file", async () => {
    const { getOverallStatus } = await import("../src/status");
    const status = getOverallStatus(db, "/nonexistent/path/db.sqlite");

    expect(status.database_size).toBe("unknown");
  });
});

describe("CLI status", () => {
  test("status --json returns overall status", async () => {
    const proc = Bun.spawn(
      ["bun", "src/index.ts", "--db", dbPath, "--json", "status"],
      { cwd: "/Users/fischer/work/ivy-blackboard", stdout: "pipe", stderr: "pipe" }
    );
    const text = await new Response(proc.stdout).text();
    await proc.exited;

    const json = JSON.parse(text);
    expect(json.ok).toBe(true);
    expect(json.database).toBe(dbPath);
    expect(json.database_size).toBeTruthy();
    expect(typeof json.projects).toBe("number");
  });

  test("status human output includes database size", async () => {
    const proc = Bun.spawn(
      ["bun", "src/index.ts", "--db", dbPath, "status"],
      { cwd: "/Users/fischer/work/ivy-blackboard", stdout: "pipe", stderr: "pipe" }
    );
    const text = await new Response(proc.stdout).text();
    await proc.exited;

    expect(text).toContain("Local Blackboard Status");
    expect(text).toContain("Database:");
    expect(text).toMatch(/\(\d+[\.\d]* (B|KB|MB|GB)\)/);
  });
});
