import type { Database } from "bun:sqlite";
import type { Server } from "bun";
import { existsSync, readFileSync, statSync } from "node:fs";
import { getOverallStatus } from "./status";
import { listAgents } from "./agent";
import { listWorkItems, getWorkItemStatus, deleteWorkItem, updateWorkItemMetadata, appendWorkItemEvent } from "./work";
import { listProjects, getProjectDetail } from "./project";
import { observeEvents } from "./events";
import type { BlackboardAgent } from "./types";

const ALLOWED_ORIGIN_RE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (ALLOWED_ORIGIN_RE.test(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function jsonResponse(data: unknown, status = 200, cors: Record<string, string> = {}): Response {
  return new Response(
    JSON.stringify(
      { ok: status < 400, ...data, timestamp: new Date().toISOString() },
      null,
      2
    ),
    {
      status,
      headers: { "Content-Type": "application/json", ...cors },
    }
  );
}

/**
 * Create the web dashboard HTTP server.
 * Returns the Bun server instance (call .stop() to shut down).
 */
export function createServer(
  db: Database,
  dbPath: string,
  port: number = 3141
): Server {
  return Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);
      const cors = corsHeaders(req);

      // CORS preflight
      if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: cors });
      }

      try {
        // API routes
        if (url.pathname === "/api/status") {
          return jsonResponse(getOverallStatus(db, dbPath), 200, cors);
        }

        if (url.pathname === "/api/agents") {
          const all = url.searchParams.get("all") === "true";
          const status = url.searchParams.get("status") ?? undefined;
          const agents = listAgents(db, { all, status });
          return jsonResponse({ count: agents.length, items: agents }, 200, cors);
        }

        if (url.pathname === "/api/work") {
          const all = url.searchParams.get("all") === "true";
          const status = url.searchParams.get("status") ?? undefined;
          const project = url.searchParams.get("project") ?? undefined;
          const items = listWorkItems(db, { all, status, project });
          return jsonResponse({ count: items.length, items }, 200, cors);
        }

        // Work item detail / delete endpoint
        const workMatch = url.pathname.match(/^\/api\/work\/([^/]+)$/);
        if (workMatch) {
          const itemId = decodeURIComponent(workMatch[1]);

          if (req.method === "DELETE") {
            const force = url.searchParams.get("force") === "true";
            const result = deleteWorkItem(db, itemId, force);
            return jsonResponse(result, 200, cors);
          }

          const detail = getWorkItemStatus(db, itemId);

          // Enrich with agent name if claimed
          let agent_name: string | null = null;
          if (detail.item.claimed_by) {
            const agent = db
              .query("SELECT agent_name FROM agents WHERE session_id = ?")
              .get(detail.item.claimed_by) as { agent_name: string } | null;
            agent_name = agent?.agent_name ?? null;
          }

          return jsonResponse({
            ...detail,
            agent_name,
          }, 200, cors);
        }

        // Work item metadata update endpoint
        const metadataMatch = url.pathname.match(/^\/api\/work\/([^/]+)\/metadata$/);
        if (metadataMatch && req.method === "PATCH") {
          const itemId = decodeURIComponent(metadataMatch[1]);
          const body = await req.json() as Record<string, unknown>;
          const result = updateWorkItemMetadata(db, itemId, body);
          return jsonResponse(result, 200, cors);
        }

        // Work item event append endpoint
        const eventMatch = url.pathname.match(/^\/api\/work\/([^/]+)\/events$/);
        if (eventMatch && req.method === "POST") {
          const itemId = decodeURIComponent(eventMatch[1]);
          const body = await req.json() as {
            event_type: string;
            summary: string;
            actor_id?: string;
            metadata?: Record<string, unknown>;
          };
          const result = appendWorkItemEvent(db, itemId, body);
          return jsonResponse(result, 200, cors);
        }

        if (url.pathname === "/api/events") {
          const since = url.searchParams.get("since") ?? undefined;
          const type = url.searchParams.get("filter") ?? undefined;
          const limitStr = url.searchParams.get("limit");
          const limit = limitStr ? parseInt(limitStr, 10) : undefined;
          const events = observeEvents(db, { since, type, limit });
          return jsonResponse({ count: events.length, items: events }, 200, cors);
        }

        // Agent log endpoint
        const logMatch = url.pathname.match(/^\/api\/agents\/([^/]+)\/log$/);
        if (logMatch) {
          const sessionId = decodeURIComponent(logMatch[1]);

          // Look up agent to find log path in metadata
          const agent = db
            .query("SELECT * FROM agents WHERE session_id = ?")
            .get(sessionId) as BlackboardAgent | null;

          if (!agent) {
            return jsonResponse({ error: "Agent not found" }, 404, cors);
          }

          let logPath: string | null = null;
          if (agent.metadata) {
            try {
              const meta = JSON.parse(agent.metadata);
              logPath = meta.logPath ?? null;
            } catch {}
          }

          if (!logPath || !existsSync(logPath)) {
            return jsonResponse({ error: "No log file available", logPath }, 404, cors);
          }

          const tailParam = url.searchParams.get("tail");
          const size = statSync(logPath).size;

          if (tailParam) {
            const n = parseInt(tailParam, 10);
            // For tail requests, read only the last chunk to avoid loading entire file
            const TAIL_CHUNK_SIZE = Math.min(size, 256 * 1024); // Read last 256KB max
            const fd = require("fs").openSync(logPath, "r");
            const buf = Buffer.alloc(TAIL_CHUNK_SIZE);
            const startPos = Math.max(0, size - TAIL_CHUNK_SIZE);
            require("fs").readSync(fd, buf, 0, TAIL_CHUNK_SIZE, startPos);
            require("fs").closeSync(fd);
            const chunk = buf.toString("utf-8");
            let lines = chunk.split("\n");
            // If we started mid-file, drop the first partial line
            if (startPos > 0) lines = lines.slice(1);
            // Drop trailing empty element from final newline
            if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
            const tailed = lines.slice(-n).join("\n");
            return new Response(tailed, {
              headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "X-Log-Size": String(size),
                "X-Agent-Status": agent.status,
                ...cors,
              },
            });
          }

          // For full reads, cap at 1MB to prevent memory issues with huge logs
          const MAX_FULL_READ = 1024 * 1024;
          let content: string;
          if (size > MAX_FULL_READ) {
            const fd = require("fs").openSync(logPath, "r");
            const buf = Buffer.alloc(MAX_FULL_READ);
            const startPos = size - MAX_FULL_READ;
            require("fs").readSync(fd, buf, 0, MAX_FULL_READ, startPos);
            require("fs").closeSync(fd);
            // Drop first partial line since we started mid-file
            const chunk = buf.toString("utf-8");
            const firstNewline = chunk.indexOf("\n");
            content = "[... truncated, showing last ~1MB ...]\n" + chunk.slice(firstNewline + 1);
          } else {
            content = readFileSync(logPath, "utf-8");
          }

          return new Response(content, {
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "X-Log-Size": String(size),
              "X-Agent-Status": agent.status,
              ...cors,
            },
          });
        }

        // SSE endpoint for live event streaming
        if (url.pathname === "/api/events/stream") {
          const lastEventId = req.headers.get("Last-Event-ID");
          let lastId = lastEventId ? parseInt(lastEventId, 10) : 0;

          // If no Last-Event-ID, start from current max
          if (!lastId) {
            const row = db
              .query("SELECT MAX(id) as max_id FROM events")
              .get() as { max_id: number | null } | null;
            lastId = row?.max_id ?? 0;
          }

          const stream = new ReadableStream({
            start(controller) {
              const encoder = new TextEncoder();

              const send = (data: string, id?: number) => {
                try {
                  if (id) controller.enqueue(encoder.encode(`id: ${id}\n`));
                  controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                } catch {
                  clearInterval(interval);
                }
              };

              // Send initial connection message
              send(JSON.stringify({ type: "connected", last_id: lastId }));

              const interval = setInterval(() => {
                try {
                  const newEvents = db
                    .query("SELECT * FROM events WHERE id > ? ORDER BY id ASC LIMIT 50")
                    .all(lastId) as Array<{ id: number; [key: string]: any }>;

                  for (const event of newEvents) {
                    send(JSON.stringify(event), event.id);
                    lastId = event.id;
                  }
                } catch {
                  clearInterval(interval);
                  controller.close();
                }
              }, 2000);

              // Clean up on abort
              req.signal.addEventListener("abort", () => {
                clearInterval(interval);
              });
            },
          });

          return new Response(stream, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
              ...cors,
            },
          });
        }

        if (url.pathname === "/api/projects") {
          const projects = listProjects(db);
          return jsonResponse({ count: projects.length, items: projects }, 200, cors);
        }

        // Project detail endpoint
        const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
        if (projectMatch) {
          const projectId = decodeURIComponent(projectMatch[1]);
          const detail = getProjectDetail(db, projectId);
          return jsonResponse(detail, 200, cors);
        }

        // Dashboard HTML
        if (url.pathname === "/" || url.pathname === "/index.html") {
          try {
            const html = require("fs").readFileSync(
              require("path").join(__dirname, "web", "dashboard.html"),
              "utf8"
            );
            return new Response(html, {
              headers: { "Content-Type": "text/html", ...cors },
            });
          } catch {
            return new Response(
              "<html><body><h1>Blackboard Dashboard</h1><p>Dashboard HTML not found. Create src/web/dashboard.html</p></body></html>",
              { headers: { "Content-Type": "text/html", ...cors } }
            );
          }
        }

        return jsonResponse({ error: "Not found" }, 404, cors);
      } catch (err: any) {
        return jsonResponse(
          { error: err.message ?? "Internal server error" },
          err.code ? 400 : 500,
          cors
        );
      }
    },
  });
}
