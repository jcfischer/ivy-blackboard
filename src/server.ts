import type { Database } from "bun:sqlite";
import type { Server } from "bun";
import { existsSync, readFileSync, statSync } from "node:fs";
import { getOverallStatus } from "./status";
import { listAgents } from "./agent";
import { listWorkItems } from "./work";
import { listProjects, getProjectDetail } from "./project";
import { observeEvents } from "./events";
import type { BlackboardAgent } from "./types";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(
    JSON.stringify(
      { ok: status < 400, ...data, timestamp: new Date().toISOString() },
      null,
      2
    ),
    {
      status,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
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
    fetch(req) {
      const url = new URL(req.url);

      // CORS preflight
      if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }

      try {
        // API routes
        if (url.pathname === "/api/status") {
          return jsonResponse(getOverallStatus(db, dbPath));
        }

        if (url.pathname === "/api/agents") {
          const all = url.searchParams.get("all") === "true";
          const status = url.searchParams.get("status") ?? undefined;
          const agents = listAgents(db, { all, status });
          return jsonResponse({ count: agents.length, items: agents });
        }

        if (url.pathname === "/api/work") {
          const all = url.searchParams.get("all") === "true";
          const status = url.searchParams.get("status") ?? undefined;
          const project = url.searchParams.get("project") ?? undefined;
          const items = listWorkItems(db, { all, status, project });
          return jsonResponse({ count: items.length, items });
        }

        if (url.pathname === "/api/events") {
          const since = url.searchParams.get("since") ?? undefined;
          const type = url.searchParams.get("filter") ?? undefined;
          const limitStr = url.searchParams.get("limit");
          const limit = limitStr ? parseInt(limitStr, 10) : undefined;
          const events = observeEvents(db, { since, type, limit });
          return jsonResponse({ count: events.length, items: events });
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
            return jsonResponse({ error: "Agent not found" }, 404);
          }

          let logPath: string | null = null;
          if (agent.metadata) {
            try {
              const meta = JSON.parse(agent.metadata);
              logPath = meta.logPath ?? null;
            } catch {}
          }

          if (!logPath || !existsSync(logPath)) {
            return jsonResponse({ error: "No log file available", logPath }, 404);
          }

          const tailParam = url.searchParams.get("tail");
          const content = readFileSync(logPath, "utf-8");

          if (tailParam) {
            const n = parseInt(tailParam, 10);
            const lines = content.split("\n");
            const tailed = lines.slice(-n).join("\n");
            return new Response(tailed, {
              headers: { "Content-Type": "text/plain; charset=utf-8", ...CORS_HEADERS },
            });
          }

          const size = statSync(logPath).size;
          return new Response(content, {
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "X-Log-Size": String(size),
              "X-Agent-Status": agent.status,
              ...CORS_HEADERS,
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
              ...CORS_HEADERS,
            },
          });
        }

        if (url.pathname === "/api/projects") {
          const projects = listProjects(db);
          return jsonResponse({ count: projects.length, items: projects });
        }

        // Project detail endpoint
        const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
        if (projectMatch) {
          const projectId = decodeURIComponent(projectMatch[1]);
          const detail = getProjectDetail(db, projectId);
          return jsonResponse(detail);
        }

        // Dashboard HTML
        if (url.pathname === "/" || url.pathname === "/index.html") {
          try {
            const html = require("fs").readFileSync(
              require("path").join(__dirname, "web", "dashboard.html"),
              "utf8"
            );
            return new Response(html, {
              headers: { "Content-Type": "text/html", ...CORS_HEADERS },
            });
          } catch {
            return new Response(
              "<html><body><h1>Blackboard Dashboard</h1><p>Dashboard HTML not found. Create src/web/dashboard.html</p></body></html>",
              { headers: { "Content-Type": "text/html", ...CORS_HEADERS } }
            );
          }
        }

        return jsonResponse({ error: "Not found" }, 404);
      } catch (err: any) {
        return jsonResponse(
          { error: err.message ?? "Internal server error" },
          err.code ? 400 : 500
        );
      }
    },
  });
}
