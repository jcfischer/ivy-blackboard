import type { Database } from "bun:sqlite";
import type { Server } from "bun";
import { getOverallStatus } from "./status";
import { listAgents } from "./agent";
import { listWorkItems } from "./work";
import { listProjects } from "./project";
import { observeEvents } from "./events";

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
