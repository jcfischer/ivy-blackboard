---
feature: "SSE Live Updates for Dashboard"
spec: "./spec.md"
status: "draft"
---

# Technical Plan: SSE Live Updates for Dashboard

## Architecture Overview

Coordinator HTTP server adds a new `/api/events/stream` endpoint that implements Server-Sent Events (SSE). The endpoint holds HTTP connections open and streams new events from the database in real-time. The F-17 dashboard upgrades to use EventSource API instead of polling, with fallback to polling if SSE is unavailable.

```
Database (events table)
  |
  v
Coordinator /api/events/stream
  |
  ├─ Poll events table every 2 seconds
  ├─ Detect new events (id > last_sent_id)
  ├─ Format as SSE message: `id: N\ndata: {JSON}\n\n`
  └─ Send to connected clients via ReadableStream
  |
  v
Browser EventSource connection
  |
  ├─ Listen for "message" events
  ├─ Parse JSON data
  ├─ Prepend to events table in DOM
  └─ Fall back to polling if disconnected
```

## Technology Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Protocol | HTTP/1.1 with SSE | Standard, no upgrades needed |
| API | Server-Sent Events (text/event-stream) | Native browser support, simple |
| Polling | setInterval on events table | 2 second interval sufficient |
| Reconnection | EventSource native retry + manual backoff | Browser handles low-level retry |
| Fallback | F-17 polling on error | Graceful degradation |

## Constitutional Compliance

- [x] **CLI-First:** Not applicable (HTTP endpoint feature)
- [x] **Library-First:** Not applicable (server endpoint feature)
- [x] **Test-First:** Integration tests for SSE endpoint and client behavior
- [x] **Simplicity Gate:** No external SSE library, minimal code
- [x] **Anti-Abstraction Gate:** Direct ReadableStream API, no wrapper

## SSE Endpoint Design

### Route Handler

```typescript
// In src/server.ts
async function handleEventsStream(req: Request): Promise<Response> {
  // Initialize SSE response headers
  const headers = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  };

  // Create ReadableStream that polls database
  const stream = new ReadableStream({
    async start(controller) {
      let lastEventId = 0;

      const pollInterval = setInterval(async () => {
        try {
          // Query new events from database
          const newEvents = db.query(`
            SELECT id, timestamp, event_type, actor_id, target_id, summary
            FROM events
            WHERE id > ?
            ORDER BY id ASC
          `).all(lastEventId);

          // Send each event as SSE message
          for (const event of newEvents) {
            const sse = `id: ${event.id}\n` +
                       `event: ${event.event_type}\n` +
                       `data: ${JSON.stringify(event)}\n\n`;
            controller.enqueue(sse);
            lastEventId = event.id;
          }
        } catch (error) {
          console.error("Error polling events:", error);
          controller.close();
        }
      }, 2000);

      // Clean up on connection close
      req.signal?.addEventListener("abort", () => {
        clearInterval(pollInterval);
        controller.close();
      });
    }
  });

  return new Response(stream, { headers });
}
```

### Message Format

Each SSE message includes:
- `id: N` - Event ID for browser to track (enables resume on reconnect)
- `event: event_type` - Event type for filtering (optional, for browser handlers)
- `data: {JSON}` - Full event object as JSON string

Example:
```
id: 42
event: work_item_claimed
data: {"id":42,"timestamp":"2026-02-03T12:35:00Z","event_type":"work_item_claimed","actor_id":"researcher-1","target_id":"item-001","summary":"researcher-1 claimed item-001"}

id: 43
event: agent_started
data: {"id":43,"timestamp":"2026-02-03T12:35:01Z","event_type":"agent_started","actor_id":"writer-2","target_id":null,"summary":"Agent writer-2 started with PID 5678"}

```

## Dashboard Client Design

### EventSource Connection

```javascript
// In src/web/dashboard.html <script> section
let eventSource = null;
let fallbackToPolling = false;

function startEventSource() {
  if (eventSource) eventSource.close();

  try {
    eventSource = new EventSource(`${API_BASE}/api/events/stream`);

    eventSource.onopen = () => {
      console.log("SSE connected");
      fallbackToPolling = false;
      updateConnectionStatus("connected");
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        prependEvent(data); // Add to top of events table
      } catch (error) {
        console.error("Failed to parse SSE data:", error);
      }
    };

    eventSource.onerror = () => {
      console.warn("SSE connection lost, falling back to polling");
      fallbackToPolling = true;
      updateConnectionStatus("disconnected");
      eventSource.close();
      eventSource = null;

      // Attempt reconnect after delay (exponential backoff)
      setTimeout(startEventSource, 5000);
    };
  } catch (error) {
    console.error("Failed to start EventSource:", error);
    fallbackToPolling = true;
    updateConnectionStatus("disconnected");
  }
}

function prependEvent(event) {
  const tbody = document.querySelector("#events-content tbody");
  if (!tbody) return;

  const row = document.createElement("tr");
  row.innerHTML = `
    <td>${formatTime(event.timestamp)}</td>
    <td>${event.event_type}</td>
    <td>${event.actor_id || "—"}</td>
    <td>${event.target_id || "—"}</td>
    <td>${event.summary}</td>
  `;
  tbody.insertBefore(row, tbody.firstChild);

  // Keep only last 50 events for performance
  while (tbody.children.length > 50) {
    tbody.removeChild(tbody.lastChild);
  }
}

function updateConnectionStatus(status) {
  const indicator = document.getElementById("connection-status");
  if (!indicator) return;

  indicator.textContent = status === "connected" ? "✓ Streaming" : "↻ Polling";
  indicator.className = `status-badge status-${status === "connected" ? "ok" : "warn"}`;
}

// Start SSE on page load
startEventSource();

// Fallback: also refresh events every 5s if polling
function refreshEvents() {
  if (fallbackToPolling || !eventSource) {
    fetchData("events").then(events => {
      if (events) {
        renderEvents(events);
      }
    });
  }
}

setInterval(refreshEvents, 5000);
```

## API Contracts

### Coordinator → Browser (SSE)

See message format above. Events streamed one per SSE message.

### Browser → Coordinator (optional)

Dashboard does not send data to coordinator (read-only interface).

## File Structure

```
src/
├── server.ts              # [Modified] Add /api/events/stream handler
├── web/
│   └── dashboard.html     # [Modified] Add EventSource client code

tests/
├── server.test.ts         # [Modified] Add SSE endpoint tests
└── web/
    └── dashboard.test.ts  # [Modified] Add EventSource client tests
```

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Many simultaneous connections leak memory | High | Medium | Track connections, clean up on close |
| Database query every 2s on each connection | Medium | Low | Optimize query, add index on events.id |
| Browser doesn't support EventSource | Medium | Low | Fallback to polling already in place |
| SSE connection hangs (stuck socket) | Medium | Low | Browser timeout + manual heartbeat (optional) |

## Failure Mode Analysis

| Failure Mode | Trigger | Detection | Degradation | Recovery |
|-------------|---------|-----------|-------------|----------|
| SSE endpoint not available | Code not deployed | eventSource.onerror | Fall back to polling | Restart coordinator |
| Database query fails | Corrupt data or lock | catch block | No new events sent | Resolve database issue |
| Network disconnect | WiFi loss, mobile | eventSource.onerror | "Polling" status | Auto-reconnect in 5s |
| Too many open connections | 100+ clients | Server memory | Connection refused | Implement connection limit |

## Dependencies

### External
- Browser: EventSource API (native)
- Coordinator: HTTP server with ReadableStream support (Bun native)

### Internal
- F-1: Database with events table and id column
- F-17: Dashboard HTML structure (must have `#events-content`)

## Estimated Complexity

- **New files:** 0
- **Modified files:** 2 (server.ts, dashboard.html)
- **Test files:** 2 (modified)
- **Estimated tasks:** 2
- **Debt score:** 0 (simple streaming endpoint)

## Longevity Assessment

### Maintainability Indicators

| Indicator | Status | Notes |
|-----------|--------|-------|
| **Readability:** Can a developer understand in 6 months? | Yes | SSE pattern is standard, code is straightforward |
| **Testability:** Can changes be verified without manual testing? | Yes | Mock database, test SSE message format |
| **Documentation:** Is the "why" captured? | Yes | Plan explains rationale for SSE vs polling |

### Evolution Vectors

| What Might Change | Preparation | Impact |
|------------------|-------------|--------|
| Multiple event types filtered | Add event subscription | Low |
| Event payload changes | JSON already flexible | Low |
| Switch to WebSocket | Replace EventSource with WS | Medium |
| Add heartbeat/keepalive | Send `:comment` every 30s | Low |

### Deletion Criteria

- [ ] Feature superseded by: persistent WebSocket or gRPC streaming
- [ ] Dependency deprecated: browsers drop EventSource
- [ ] User need eliminated: real-time updates no longer needed
