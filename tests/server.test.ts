import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
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

  test("GET /api/projects/:id returns project detail", async () => {
    const { createServer } = await import("../src/server");
    const { registerProject } = await import("../src/project");
    const { registerAgent } = await import("../src/agent");
    const { createWorkItem } = await import("../src/work");

    registerProject(db, { id: "detail-srv", name: "Detail Server" });
    registerAgent(db, { name: "Agent1", project: "detail-srv" });
    createWorkItem(db, { id: "ds-w1", title: "Detail Task", project: "detail-srv" });

    server = createServer(db, dbPath, 0);
    const res = await fetch(`http://localhost:${server.port}/api/projects/detail-srv`);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.project.project_id).toBe("detail-srv");
    expect(json.agents.length).toBe(1);
    expect(json.work_items.length).toBe(1);
    expect(json.stats.total_work).toBe(1);
    expect(json.stats.active_agents).toBe(1);
  });

  test("GET /api/work/:id returns work item detail with history", async () => {
    const { createServer } = await import("../src/server");
    const { createWorkItem } = await import("../src/work");
    const { registerProject } = await import("../src/project");

    registerProject(db, { id: "test-proj", name: "Test Project" });
    createWorkItem(db, { id: "detail-w1", title: "Detail Task", description: "A test description", project: "test-proj", priority: "P1" });

    server = createServer(db, dbPath, 0);
    const res = await fetch(`http://localhost:${server.port}/api/work/detail-w1`);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.item.item_id).toBe("detail-w1");
    expect(json.item.title).toBe("Detail Task");
    expect(json.item.description).toBe("A test description");
    expect(json.item.priority).toBe("P1");
    expect(Array.isArray(json.history)).toBe(true);
  });

  test("GET /api/work/:id returns 400 for missing work item", async () => {
    const { createServer } = await import("../src/server");
    server = createServer(db, dbPath, 0);
    const res = await fetch(`http://localhost:${server.port}/api/work/nonexistent`);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  test("GET /api/projects/:id returns 400 for missing project", async () => {
    const { createServer } = await import("../src/server");
    server = createServer(db, dbPath, 0);
    const res = await fetch(`http://localhost:${server.port}/api/projects/nonexistent`);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
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

  test("accepts arbitrary event type filters", async () => {
    const { createServer } = await import("../src/server");
    server = createServer(db, dbPath, 0);
    const res = await fetch(
      `http://localhost:${server.port}/api/events?filter=custom_type`
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.items).toEqual([]);
  });

  test("GET /api/work/:id returns work item detail with history", async () => {
    const { createServer } = await import("../src/server");
    const { createWorkItem } = await import("../src/work");
    createWorkItem(db, { id: "detail-w1", title: "Detail Task", description: "Full description here" });

    server = createServer(db, dbPath, 0);
    const res = await fetch(`http://localhost:${server.port}/api/work/detail-w1`);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.item.item_id).toBe("detail-w1");
    expect(json.item.title).toBe("Detail Task");
    expect(json.item.description).toBe("Full description here");
    expect(json.history).toBeArray();
    expect(json.history.length).toBeGreaterThan(0);
    expect(json.history[0].event_type).toBe("work_created");
  });

  test("GET /api/work/:id returns agent_name when claimed", async () => {
    const { createServer } = await import("../src/server");
    const { registerAgent } = await import("../src/agent");
    const { createWorkItem, claimWorkItem } = await import("../src/work");

    const agent = registerAgent(db, { name: "ClaimAgent" });
    createWorkItem(db, { id: "claim-w1", title: "Claimed Task" });
    claimWorkItem(db, "claim-w1", agent.session_id);

    server = createServer(db, dbPath, 0);
    const res = await fetch(`http://localhost:${server.port}/api/work/claim-w1`);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.item.status).toBe("claimed");
    expect(json.item.claimed_by).toBe(agent.session_id);
    expect(json.agent_name).toBe("ClaimAgent");
  });

  test("GET /api/work/:id returns 400 for missing item", async () => {
    const { createServer } = await import("../src/server");
    server = createServer(db, dbPath, 0);
    const res = await fetch(`http://localhost:${server.port}/api/work/nonexistent`);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  test("DELETE /api/work/:id deletes available work item", async () => {
    const { createServer } = await import("../src/server");
    const { createWorkItem } = await import("../src/work");

    createWorkItem(db, { id: "api-del-1", title: "API Delete" });
    server = createServer(db, dbPath, 0);

    const res = await fetch(`http://localhost:${server.port}/api/work/api-del-1`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.deleted).toBe(true);
    expect(json.item_id).toBe("api-del-1");
  });

  test("DELETE /api/work/:id refuses claimed item without force", async () => {
    const { createServer } = await import("../src/server");
    const { createWorkItem, claimWorkItem } = await import("../src/work");
    const { registerAgent } = await import("../src/agent");

    createWorkItem(db, { id: "api-del-2", title: "API Claimed" });
    const agent = registerAgent(db, { name: "Agent" });
    claimWorkItem(db, "api-del-2", agent.session_id);
    server = createServer(db, dbPath, 0);

    const res = await fetch(`http://localhost:${server.port}/api/work/api-del-2`, {
      method: "DELETE",
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toContain("claimed");
  });

  test("DELETE /api/work/:id with force deletes claimed item", async () => {
    const { createServer } = await import("../src/server");
    const { createWorkItem, claimWorkItem } = await import("../src/work");
    const { registerAgent } = await import("../src/agent");

    createWorkItem(db, { id: "api-del-3", title: "API Force" });
    const agent = registerAgent(db, { name: "Agent" });
    claimWorkItem(db, "api-del-3", agent.session_id);
    server = createServer(db, dbPath, 0);

    const res = await fetch(`http://localhost:${server.port}/api/work/api-del-3?force=true`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.deleted).toBe(true);
  });

  test("DELETE /api/work/:id returns 400 for missing item", async () => {
    const { createServer } = await import("../src/server");
    server = createServer(db, dbPath, 0);

    const res = await fetch(`http://localhost:${server.port}/api/work/nonexistent`, {
      method: "DELETE",
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  test("PATCH /api/work/:id/metadata merges metadata", async () => {
    const { createServer } = await import("../src/server");
    const { createWorkItem } = await import("../src/work");

    createWorkItem(db, { id: "api-meta-1", title: "API Metadata", metadata: '{"existing": true}' });
    server = createServer(db, dbPath, 0);

    const res = await fetch(`http://localhost:${server.port}/api/work/api-meta-1/metadata`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approved: true, reviewer: "alice" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.updated).toBe(true);
    expect(json.metadata).toEqual({ existing: true, approved: true, reviewer: "alice" });
  });

  test("PATCH /api/work/:id/metadata returns 400 for missing item", async () => {
    const { createServer } = await import("../src/server");
    server = createServer(db, dbPath, 0);

    const res = await fetch(`http://localhost:${server.port}/api/work/nonexistent/metadata`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "value" }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  test("POST /api/work/:id/events appends event", async () => {
    const { createServer } = await import("../src/server");
    const { createWorkItem } = await import("../src/work");

    createWorkItem(db, { id: "api-evt-1", title: "API Event" });
    server = createServer(db, dbPath, 0);

    const res = await fetch(`http://localhost:${server.port}/api/work/api-evt-1/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_type: "comment_received",
        summary: "New comment from bob",
        metadata: { author: "bob" },
      }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.event_type).toBe("comment_received");
    expect(json.event_id).toBeGreaterThan(0);
  });

  test("POST /api/work/:id/events returns 400 for invalid event_type", async () => {
    const { createServer } = await import("../src/server");
    const { createWorkItem } = await import("../src/work");

    createWorkItem(db, { id: "api-evt-2", title: "API Event Bad" });
    server = createServer(db, dbPath, 0);

    const res = await fetch(`http://localhost:${server.port}/api/work/api-evt-2/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_type: "invalid_type",
        summary: "Should fail",
      }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toContain("invalid_type");
  });

  test("POST /api/work/:id/events returns 400 for missing item", async () => {
    const { createServer } = await import("../src/server");
    server = createServer(db, dbPath, 0);

    const res = await fetch(`http://localhost:${server.port}/api/work/nonexistent/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_type: "comment_received",
        summary: "Should fail",
      }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  test("GET /api/agents/:id/log returns log content when metadata has logPath", async () => {
    const { createServer } = await import("../src/server");
    const { registerAgent, sendHeartbeat } = await import("../src/agent");

    const agent = registerAgent(db, { name: "LogAgent" });
    const logFile = join(tmpDir, "agent.log");
    writeFileSync(logFile, "line 1\nline 2\nline 3\n");

    // Send heartbeat with logPath metadata to persist it on agents table
    sendHeartbeat(db, { sessionId: agent.session_id, metadata: JSON.stringify({ logPath: logFile }) });

    server = createServer(db, dbPath, 0, { allowedLogDirs: [tmpDir] });
    const res = await fetch(`http://localhost:${server.port}/api/agents/${agent.session_id}/log`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(res.headers.get("x-agent-status")).toBe("active");
    expect(res.headers.get("x-log-size")).toBeTruthy();
    const text = await res.text();
    expect(text).toContain("line 1");
    expect(text).toContain("line 3");
  });

  test("GET /api/agents/:id/log?tail=2 returns last 2 lines", async () => {
    const { createServer } = await import("../src/server");
    const { registerAgent, sendHeartbeat } = await import("../src/agent");

    const agent = registerAgent(db, { name: "TailAgent" });
    const logFile = join(tmpDir, "tail.log");
    writeFileSync(logFile, "line 1\nline 2\nline 3\nline 4\n");
    sendHeartbeat(db, { sessionId: agent.session_id, metadata: JSON.stringify({ logPath: logFile }) });

    server = createServer(db, dbPath, 0, { allowedLogDirs: [tmpDir] });
    const res = await fetch(`http://localhost:${server.port}/api/agents/${agent.session_id}/log?tail=2`);
    expect(res.status).toBe(200);
    const text = await res.text();
    const lines = text.split("\n").filter(l => l.length > 0);
    expect(lines.length).toBe(2);
    expect(lines[0]).toBe("line 3");
    expect(lines[1]).toBe("line 4");
  });

  test("GET /api/agents/:id/log returns 404 when no metadata", async () => {
    const { createServer } = await import("../src/server");
    const { registerAgent } = await import("../src/agent");

    const agent = registerAgent(db, { name: "NoLogAgent" });

    server = createServer(db, dbPath, 0);
    const res = await fetch(`http://localhost:${server.port}/api/agents/${agent.session_id}/log`);
    expect(res.status).toBe(404);
  });

  test("GET /api/agents/:id/log returns 404 for nonexistent agent", async () => {
    const { createServer } = await import("../src/server");
    server = createServer(db, dbPath, 0);
    const res = await fetch(`http://localhost:${server.port}/api/agents/nonexistent/log`);
    expect(res.status).toBe(404);
  });

  test("GET /api/agents/:id/log returns 403 for path traversal attempt", async () => {
    const { createServer } = await import("../src/server");
    const { registerAgent, sendHeartbeat } = await import("../src/agent");

    const agent = registerAgent(db, { name: "TraversalAgent" });
    // Attempt path traversal via logPath metadata
    sendHeartbeat(db, {
      sessionId: agent.session_id,
      metadata: JSON.stringify({ logPath: join(tmpDir, "../../etc/passwd") }),
    });

    server = createServer(db, dbPath, 0, { allowedLogDirs: [tmpDir] });
    const res = await fetch(`http://localhost:${server.port}/api/agents/${agent.session_id}/log`);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toContain("Access denied");
  });

  test("GET /api/agents/:id/log returns 403 for absolute path outside allowed dir", async () => {
    const { createServer } = await import("../src/server");
    const { registerAgent, sendHeartbeat } = await import("../src/agent");

    const agent = registerAgent(db, { name: "AbsTraversalAgent" });
    sendHeartbeat(db, {
      sessionId: agent.session_id,
      metadata: JSON.stringify({ logPath: "/etc/passwd" }),
    });

    server = createServer(db, dbPath, 0, { allowedLogDirs: [tmpDir] });
    const res = await fetch(`http://localhost:${server.port}/api/agents/${agent.session_id}/log`);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toContain("Access denied");
  });

  test("GET /api/agents/:id/log returns 403 for traversal via ../ in path", async () => {
    const { createServer } = await import("../src/server");
    const { registerAgent, sendHeartbeat } = await import("../src/agent");

    const agent = registerAgent(db, { name: "EncodedTraversalAgent" });
    // Path that resolves outside allowed dir via ../
    sendHeartbeat(db, {
      sessionId: agent.session_id,
      metadata: JSON.stringify({ logPath: tmpDir + "/../../../etc/passwd" }),
    });

    server = createServer(db, dbPath, 0, { allowedLogDirs: [tmpDir] });
    const res = await fetch(`http://localhost:${server.port}/api/agents/${agent.session_id}/log`);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toContain("Access denied");
  });
});

describe("isPathSafe", () => {
  test("allows paths within base directory", async () => {
    const { isPathSafe } = await import("../src/server");
    expect(isPathSafe("/home/user/.pai/logs/agent.log", "/home/user")).toBe(true);
  });

  test("rejects paths outside base directory", async () => {
    const { isPathSafe } = await import("../src/server");
    expect(isPathSafe("/etc/passwd", "/home/user")).toBe(false);
  });

  test("rejects traversal via ../ within path", async () => {
    const { isPathSafe } = await import("../src/server");
    expect(isPathSafe("/home/user/.pai/../../etc/passwd", "/home/user")).toBe(false);
  });

  test("handles base directory itself", async () => {
    const { isPathSafe } = await import("../src/server");
    expect(isPathSafe("/home/user", "/home/user")).toBe(true);
  });

  test("rejects base prefix that is not a directory boundary", async () => {
    const { isPathSafe } = await import("../src/server");
    // /home/username should NOT match /home/user
    expect(isPathSafe("/home/username/file.log", "/home/user")).toBe(false);
  });
});
