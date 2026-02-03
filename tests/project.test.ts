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
  tmpDir = join(tmpdir(), `bb-project-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  dbPath = join(tmpDir, "test.db");
  resetConfigCache();
  db = openDatabase(dbPath);
});

afterEach(() => {
  closeDatabase(db);
  rmSync(tmpDir, { recursive: true, force: true });
});

// T-1.1: Core registerProject
describe("registerProject", () => {
  test("creates project row with all fields", async () => {
    const { registerProject } = await import("../src/project");
    const result = registerProject(db, {
      id: "pai-collab",
      name: "PAI Collab",
      path: "/Users/fischer/work/pai-collab",
      repo: "mellanon/pai-collab",
    });

    expect(result.project_id).toBe("pai-collab");
    expect(result.display_name).toBe("PAI Collab");
    expect(result.local_path).toBe("/Users/fischer/work/pai-collab");
    expect(result.remote_repo).toBe("mellanon/pai-collab");
    expect(result.registered_at).toBeTruthy();

    const row = db.query("SELECT * FROM projects WHERE project_id = ?").get("pai-collab") as any;
    expect(row).not.toBeNull();
    expect(row.display_name).toBe("PAI Collab");
  });

  test("handles optional fields as null", async () => {
    const { registerProject } = await import("../src/project");
    const result = registerProject(db, { id: "minimal", name: "Minimal Project" });

    expect(result.local_path).toBeNull();
    expect(result.remote_repo).toBeNull();
  });

  test("emits project_registered event", async () => {
    const { registerProject } = await import("../src/project");
    registerProject(db, { id: "pai-collab", name: "PAI Collab" });

    const event = db.query(
      "SELECT * FROM events WHERE event_type = 'project_registered'"
    ).get() as any;

    expect(event).not.toBeNull();
    expect(event.target_id).toBe("pai-collab");
    expect(event.target_type).toBe("project");
    expect(event.summary).toContain("PAI Collab");
  });

  test("stores and retrieves metadata", async () => {
    const { registerProject } = await import("../src/project");
    const metadata = JSON.stringify({ branch: "main", status: "active" });
    registerProject(db, { id: "meta-proj", name: "Meta", metadata });

    const row = db.query("SELECT metadata FROM projects WHERE project_id = ?").get("meta-proj") as any;
    expect(JSON.parse(row.metadata)).toEqual({ branch: "main", status: "active" });
  });

  test("throws on invalid metadata JSON", async () => {
    const { registerProject } = await import("../src/project");
    expect(() =>
      registerProject(db, { id: "bad-meta", name: "Bad", metadata: "not-json{" })
    ).toThrow();
  });

  test("throws on duplicate project_id", async () => {
    const { registerProject } = await import("../src/project");
    registerProject(db, { id: "dup", name: "First" });
    expect(() => registerProject(db, { id: "dup", name: "Second" })).toThrow("dup");
  });
});

// T-2.1: Core listProjects
describe("listProjects", () => {
  test("returns all projects ordered by registered_at DESC", async () => {
    const { registerProject, listProjects } = await import("../src/project");
    registerProject(db, { id: "old", name: "Old" });
    await Bun.sleep(10);
    registerProject(db, { id: "new", name: "New" });

    const result = listProjects(db);
    expect(result.length).toBe(2);
    expect(result[0].project_id).toBe("new");
    expect(result[1].project_id).toBe("old");
  });

  test("includes active agent count per project", async () => {
    const { registerProject, listProjects } = await import("../src/project");
    const { registerAgent } = await import("../src/agent");

    registerProject(db, { id: "proj-a", name: "A" });
    registerProject(db, { id: "proj-b", name: "B" });

    registerAgent(db, { name: "Agent1", project: "proj-a" });
    registerAgent(db, { name: "Agent2", project: "proj-a" });
    registerAgent(db, { name: "Agent3", project: "proj-b" });

    const result = listProjects(db);
    const projA = result.find((p) => p.project_id === "proj-a");
    const projB = result.find((p) => p.project_id === "proj-b");

    expect(projA!.active_agents).toBe(2);
    expect(projB!.active_agents).toBe(1);
  });

  test("returns 0 agents for projects with no active agents", async () => {
    const { registerProject, listProjects } = await import("../src/project");
    const { registerAgent, deregisterAgent } = await import("../src/agent");

    registerProject(db, { id: "empty", name: "Empty" });
    const agent = registerAgent(db, { name: "Gone", project: "empty" });
    deregisterAgent(db, agent.session_id);

    const result = listProjects(db);
    expect(result[0].active_agents).toBe(0);
  });

  test("returns empty array when no projects", async () => {
    const { listProjects } = await import("../src/project");
    const result = listProjects(db);
    expect(result).toEqual([]);
  });
});

// T-F11-1.1: getProjectStatus
describe("getProjectStatus", () => {
  test("returns project, agents, and work items", async () => {
    const { registerProject, getProjectStatus } = await import("../src/project");
    const { registerAgent } = await import("../src/agent");
    const { createWorkItem } = await import("../src/work");

    registerProject(db, { id: "status-proj", name: "Status Project", path: "/tmp/sp" });
    registerAgent(db, { name: "Worker1", project: "status-proj" });
    registerAgent(db, { name: "Worker2", project: "status-proj" });
    createWorkItem(db, { id: "wi-1", title: "Task A", project: "status-proj" });
    createWorkItem(db, { id: "wi-2", title: "Task B", project: "status-proj", priority: "P1" });

    const result = getProjectStatus(db, "status-proj");
    expect(result.project.project_id).toBe("status-proj");
    expect(result.project.display_name).toBe("Status Project");
    expect(result.project.local_path).toBe("/tmp/sp");
    expect(result.agents.length).toBe(2);
    expect(result.work_items.length).toBe(2);
  });

  test("throws PROJECT_NOT_FOUND for missing project", async () => {
    const { getProjectStatus } = await import("../src/project");
    expect(() => getProjectStatus(db, "nonexistent")).toThrow("nonexistent");
  });

  test("returns empty agents array when project has no agents", async () => {
    const { registerProject, getProjectStatus } = await import("../src/project");
    registerProject(db, { id: "no-agents", name: "No Agents" });

    const result = getProjectStatus(db, "no-agents");
    expect(result.agents).toEqual([]);
    expect(result.project.project_id).toBe("no-agents");
  });

  test("returns empty work_items array when project has no work", async () => {
    const { registerProject, getProjectStatus } = await import("../src/project");
    registerProject(db, { id: "no-work", name: "No Work" });

    const result = getProjectStatus(db, "no-work");
    expect(result.work_items).toEqual([]);
  });

  test("excludes completed/stale agents from active agents list", async () => {
    const { registerProject, getProjectStatus } = await import("../src/project");
    const { registerAgent, deregisterAgent } = await import("../src/agent");

    registerProject(db, { id: "mixed-agents", name: "Mixed" });
    registerAgent(db, { name: "Active", project: "mixed-agents" });
    const completed = registerAgent(db, { name: "Done", project: "mixed-agents" });
    deregisterAgent(db, completed.session_id);

    const result = getProjectStatus(db, "mixed-agents");
    expect(result.agents.length).toBe(1);
    expect(result.agents[0].agent_name).toBe("Active");
  });

  test("includes all work item statuses", async () => {
    const { registerProject, getProjectStatus } = await import("../src/project");
    const { registerAgent } = await import("../src/agent");
    const { createWorkItem, claimWorkItem, completeWorkItem, blockWorkItem } = await import("../src/work");

    registerProject(db, { id: "all-statuses", name: "All Statuses" });
    const agent = registerAgent(db, { name: "Worker", project: "all-statuses" });

    createWorkItem(db, { id: "avail", title: "Available", project: "all-statuses" });
    createWorkItem(db, { id: "claimed", title: "Claimed", project: "all-statuses" });
    claimWorkItem(db, "claimed", agent.session_id);
    createWorkItem(db, { id: "done", title: "Done", project: "all-statuses" });
    claimWorkItem(db, "done", agent.session_id);
    completeWorkItem(db, "done", agent.session_id);
    createWorkItem(db, { id: "blocked", title: "Blocked", project: "all-statuses" });
    blockWorkItem(db, "blocked", { blockedBy: "dependency" });

    const result = getProjectStatus(db, "all-statuses");
    expect(result.work_items.length).toBe(4);
    const statuses = result.work_items.map(w => w.status);
    expect(statuses).toContain("available");
    expect(statuses).toContain("claimed");
    expect(statuses).toContain("completed");
    expect(statuses).toContain("blocked");
  });
});

// T-3.1: CLI E2E
describe("CLI project register", () => {
  test("register --id --name outputs project as JSON", async () => {
    const proc = Bun.spawn(
      ["bun", "src/index.ts", "--db", dbPath, "--json", "project", "register", "--id", "cli-proj", "--name", "CLI Project", "--path", "/tmp/test"],
      { cwd: "/Users/fischer/work/ivy-blackboard", stdout: "pipe", stderr: "pipe" }
    );
    const text = await new Response(proc.stdout).text();
    await proc.exited;

    const json = JSON.parse(text);
    expect(json.ok).toBe(true);
    expect(json.project_id).toBe("cli-proj");
    expect(json.display_name).toBe("CLI Project");
    expect(json.local_path).toBe("/tmp/test");
  });
});

describe("CLI project status", () => {
  test("status --json returns project with agents and work items", async () => {
    // Register project
    const regProc = Bun.spawn(
      ["bun", "src/index.ts", "--db", dbPath, "--json", "project", "register", "--id", "status-cli", "--name", "CLI Status"],
      { cwd: "/Users/fischer/work/ivy-blackboard", stdout: "pipe", stderr: "pipe" }
    );
    await new Response(regProc.stdout).text();
    await regProc.exited;

    // Get status
    const statusProc = Bun.spawn(
      ["bun", "src/index.ts", "--db", dbPath, "--json", "project", "status", "status-cli"],
      { cwd: "/Users/fischer/work/ivy-blackboard", stdout: "pipe", stderr: "pipe" }
    );
    const text = await new Response(statusProc.stdout).text();
    await statusProc.exited;

    const json = JSON.parse(text);
    expect(json.ok).toBe(true);
    expect(json.project.project_id).toBe("status-cli");
    expect(Array.isArray(json.agents)).toBe(true);
    expect(Array.isArray(json.work_items)).toBe(true);
  });

  test("status for missing project returns error", async () => {
    const proc = Bun.spawn(
      ["bun", "src/index.ts", "--db", dbPath, "--json", "project", "status", "missing-proj"],
      { cwd: "/Users/fischer/work/ivy-blackboard", stdout: "pipe", stderr: "pipe" }
    );
    const text = await new Response(proc.stdout).text();
    await proc.exited;

    const json = JSON.parse(text);
    expect(json.ok).toBe(false);
    expect(json.error).toContain("missing-proj");
  });
});

describe("CLI project list", () => {
  test("list --json outputs envelope with items", async () => {
    // Register first
    const regProc = Bun.spawn(
      ["bun", "src/index.ts", "--db", dbPath, "--json", "project", "register", "--id", "list-proj", "--name", "List Project"],
      { cwd: "/Users/fischer/work/ivy-blackboard", stdout: "pipe", stderr: "pipe" }
    );
    await new Response(regProc.stdout).text();
    await regProc.exited;

    const listProc = Bun.spawn(
      ["bun", "src/index.ts", "--db", dbPath, "--json", "project", "list"],
      { cwd: "/Users/fischer/work/ivy-blackboard", stdout: "pipe", stderr: "pipe" }
    );
    const listText = await new Response(listProc.stdout).text();
    await listProc.exited;

    const json = JSON.parse(listText);
    expect(json.ok).toBe(true);
    expect(json.count).toBe(1);
    expect(json.items[0].project_id).toBe("list-proj");
    expect(typeof json.items[0].active_agents).toBe("number");
  });
});
