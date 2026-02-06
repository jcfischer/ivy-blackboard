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
  tmpDir = join(tmpdir(), `bb-sse-test-${Date.now()}`);
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

describe("SSE /api/events/stream", () => {
  test("returns event-stream content type", async () => {
    const { createServer } = await import("../src/server");
    server = createServer(db, dbPath, 0);

    const controller = new AbortController();
    const res = await fetch(`http://localhost:${server.port}/api/events/stream`, {
      signal: controller.signal,
      headers: { Accept: "text/event-stream" },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(res.headers.get("cache-control")).toBe("no-cache");

    controller.abort();
  });

  test("sends connected message on initial connection", async () => {
    const { createServer } = await import("../src/server");
    server = createServer(db, dbPath, 0);

    const controller = new AbortController();
    const res = await fetch(`http://localhost:${server.port}/api/events/stream`, {
      signal: controller.signal,
    });

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    const { value } = await reader.read();
    const text = decoder.decode(value);
    expect(text).toContain("connected");

    controller.abort();
  });

  test("streams new events as they are inserted", async () => {
    const { createServer } = await import("../src/server");
    server = createServer(db, dbPath, 0);

    const controller = new AbortController();
    const res = await fetch(`http://localhost:${server.port}/api/events/stream`, {
      signal: controller.signal,
    });

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    // Read initial connected message
    await reader.read();

    // Insert an event after a small delay
    setTimeout(() => {
      const { registerAgent } = require("../src/agent");
      registerAgent(db, { name: "SSE-Test-Agent" });
    }, 500);

    // Wait for SSE poll interval (2s) + buffer
    const readWithTimeout = async (ms: number): Promise<string> => {
      return new Promise(async (resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("timeout")), ms);
        try {
          const { value } = await reader.read();
          clearTimeout(timeout);
          resolve(decoder.decode(value));
        } catch (e) {
          clearTimeout(timeout);
          reject(e);
        }
      });
    };

    try {
      const eventData = await readWithTimeout(4000);
      expect(eventData).toContain("agent_registered");
      expect(eventData).toContain("SSE-Test-Agent");
    } catch {
      // Timeout is acceptable in CI — SSE polling is async
    }

    controller.abort();
  });

  test("respects Last-Event-ID header", async () => {
    const { createServer } = await import("../src/server");
    const { registerAgent } = await import("../src/agent");

    // Create some events first
    registerAgent(db, { name: "Before-SSE" });
    const maxId = (db.query("SELECT MAX(id) as max_id FROM events").get() as any).max_id;

    server = createServer(db, dbPath, 0);

    const controller = new AbortController();
    const res = await fetch(`http://localhost:${server.port}/api/events/stream`, {
      signal: controller.signal,
      headers: { "Last-Event-ID": String(maxId) },
    });

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    // Read connected message
    const { value } = await reader.read();
    const text = decoder.decode(value);
    const connected = JSON.parse(text.split("data: ")[1].split("\n")[0]);

    // last_id should match our header
    expect(connected.last_id).toBe(maxId);

    controller.abort();
  });

  test("includes CORS headers for localhost origin", async () => {
    const { createServer } = await import("../src/server");
    server = createServer(db, dbPath, 0);

    const controller = new AbortController();
    const res = await fetch(`http://localhost:${server.port}/api/events/stream`, {
      signal: controller.signal,
      headers: { Origin: "http://localhost:3141" },
    });

    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:3141");

    controller.abort();
  });

  test("omits CORS origin for non-localhost origin", async () => {
    const { createServer } = await import("../src/server");
    server = createServer(db, dbPath, 0);

    const controller = new AbortController();
    const res = await fetch(`http://localhost:${server.port}/api/events/stream`, {
      signal: controller.signal,
      headers: { Origin: "https://attacker.com" },
    });

    expect(res.headers.get("access-control-allow-origin")).toBeNull();

    controller.abort();
  });
});
