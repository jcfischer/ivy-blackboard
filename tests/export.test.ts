import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDatabase, closeDatabase } from "../src/db";
import { resetConfigCache } from "../src/config";
import type { Database } from "bun:sqlite";

let db: Database;
let dbPath: string;
let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `bb-export-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  dbPath = join(tmpDir, "test.db");
  resetConfigCache();
  db = openDatabase(dbPath);
});

afterEach(() => {
  closeDatabase(db);
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("exportSnapshot", () => {
  test("returns complete snapshot structure", async () => {
    const { exportSnapshot } = await import("../src/export");
    const snapshot = exportSnapshot(db, dbPath);

    expect(snapshot.export_version).toBe(1);
    expect(snapshot.exported_at).toBeTruthy();
    expect(snapshot.status).toBeTruthy();
    expect(snapshot.status.database).toBe(dbPath);
    expect(Array.isArray(snapshot.agents)).toBe(true);
    expect(Array.isArray(snapshot.projects)).toBe(true);
    expect(Array.isArray(snapshot.work_items)).toBe(true);
    expect(Array.isArray(snapshot.recent_events)).toBe(true);
  });

  test("includes all agents (including completed)", async () => {
    const { exportSnapshot } = await import("../src/export");
    const { registerAgent, deregisterAgent } = await import("../src/agent");

    registerAgent(db, { name: "Active" });
    const done = registerAgent(db, { name: "Done" });
    deregisterAgent(db, done.session_id);

    const snapshot = exportSnapshot(db, dbPath);
    expect(snapshot.agents.length).toBe(2);
  });

  test("includes all work items", async () => {
    const { exportSnapshot } = await import("../src/export");
    const { createWorkItem } = await import("../src/work");

    createWorkItem(db, { id: "exp-w1", title: "Task 1" });
    createWorkItem(db, { id: "exp-w2", title: "Task 2" });

    const snapshot = exportSnapshot(db, dbPath);
    expect(snapshot.work_items.length).toBe(2);
  });

  test("includes projects", async () => {
    const { exportSnapshot } = await import("../src/export");
    const { registerProject } = await import("../src/project");

    registerProject(db, { id: "exp-p1", name: "Export Project" });

    const snapshot = exportSnapshot(db, dbPath);
    expect(snapshot.projects.length).toBe(1);
    expect(snapshot.projects[0].project_id).toBe("exp-p1");
  });

  test("includes recent events", async () => {
    const { exportSnapshot } = await import("../src/export");
    const { registerAgent } = await import("../src/agent");

    registerAgent(db, { name: "EventMaker" });

    const snapshot = exportSnapshot(db, dbPath);
    expect(snapshot.recent_events.length).toBeGreaterThan(0);
  });

  test("empty database returns valid snapshot", async () => {
    const { exportSnapshot } = await import("../src/export");
    const snapshot = exportSnapshot(db, dbPath);

    expect(snapshot.export_version).toBe(1);
    expect(snapshot.agents).toEqual([]);
    expect(snapshot.projects).toEqual([]);
    expect(snapshot.work_items).toEqual([]);
    expect(snapshot.recent_events).toEqual([]);
  });
});

describe("serializeSnapshot", () => {
  test("serializes to compact JSON by default", async () => {
    const { exportSnapshot, serializeSnapshot } = await import("../src/export");
    const snapshot = exportSnapshot(db, dbPath);
    const json = serializeSnapshot(snapshot);

    expect(json).not.toContain("\n  ");
    const parsed = JSON.parse(json);
    expect(parsed.export_version).toBe(1);
  });

  test("serializes to pretty JSON when requested", async () => {
    const { exportSnapshot, serializeSnapshot } = await import("../src/export");
    const snapshot = exportSnapshot(db, dbPath);
    const json = serializeSnapshot(snapshot, true);

    expect(json).toContain("\n  ");
  });
});

describe("CLI export", () => {
  test("export outputs valid JSON snapshot", async () => {
    const proc = Bun.spawn(
      ["bun", "src/index.ts", "--db", dbPath, "export"],
      { cwd: "/Users/fischer/work/ivy-blackboard", stdout: "pipe", stderr: "pipe" }
    );
    const text = await new Response(proc.stdout).text();
    await proc.exited;

    const json = JSON.parse(text);
    expect(json.export_version).toBe(1);
    expect(json.exported_at).toBeTruthy();
  });

  test("export --pretty outputs indented JSON", async () => {
    const proc = Bun.spawn(
      ["bun", "src/index.ts", "--db", dbPath, "export", "--pretty"],
      { cwd: "/Users/fischer/work/ivy-blackboard", stdout: "pipe", stderr: "pipe" }
    );
    const text = await new Response(proc.stdout).text();
    await proc.exited;

    expect(text).toContain("\n  ");
    const json = JSON.parse(text);
    expect(json.export_version).toBe(1);
  });

  test("export --output writes to file", async () => {
    const outPath = join(tmpDir, "export.json");
    const proc = Bun.spawn(
      ["bun", "src/index.ts", "--db", dbPath, "export", "--output", outPath],
      { cwd: "/Users/fischer/work/ivy-blackboard", stdout: "pipe", stderr: "pipe" }
    );
    const text = await new Response(proc.stdout).text();
    await proc.exited;

    expect(text).toContain("Exported to");

    const fileContent = readFileSync(outPath, "utf8");
    const json = JSON.parse(fileContent);
    expect(json.export_version).toBe(1);
  });

  test("export --output --json confirms with JSON envelope", async () => {
    const outPath = join(tmpDir, "export2.json");
    const proc = Bun.spawn(
      ["bun", "src/index.ts", "--db", dbPath, "--json", "export", "--output", outPath],
      { cwd: "/Users/fischer/work/ivy-blackboard", stdout: "pipe", stderr: "pipe" }
    );
    const text = await new Response(proc.stdout).text();
    await proc.exited;

    const json = JSON.parse(text);
    expect(json.ok).toBe(true);
    expect(json.file).toBe(outPath);
    expect(json.export_version).toBe(1);
  });
});
