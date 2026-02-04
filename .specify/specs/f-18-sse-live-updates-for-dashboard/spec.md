---
id: "F-18"
feature: "SSE Live Updates for Dashboard"
status: "draft"
created: "2026-02-03"
---

# Specification: SSE Live Updates for Dashboard

## Overview

The dashboard created in F-17 currently polls the `/api/events` endpoint every 5 seconds, adding unnecessary load on the coordinator. This feature implements Server-Sent Events (SSE) to push new events to connected dashboard clients in real-time, reducing latency from 5 seconds to <100ms and eliminating polling waste.

The coordinator exposes a new `/api/events/stream` SSE endpoint that monitors the events table, detects new events every 2 seconds, and sends them to all connected clients.

## User Scenarios

### Scenario 1: Real-time event delivery

**As a** PAI operator watching the dashboard
**I want to** see events appear in the dashboard instantly (not 5 seconds later)
**So that** I can respond quickly to system state changes

**Acceptance Criteria:**
- [ ] Event appears in dashboard within 100ms of being recorded in database
- [ ] Browser DevTools Network tab shows single EventSource connection (not polling)
- [ ] Connection auto-reconnects if coordinator restarts

### Scenario 2: Handle connection loss

**As a** PAI operator with an intermittent network connection
**I want to** the dashboard to gracefully handle disconnections and reconnect
**So that** the dashboard remains usable during network hiccups

**Acceptance Criteria:**
- [ ] Dashboard shows "streaming" or connection status indicator
- [ ] Connection auto-reconnects with exponential backoff (1s, 2s, 4s, max 30s)
- [ ] If SSE unavailable, fall back to polling (F-17 behavior)
- [ ] Manual refresh button works during disconnection

### Scenario 3: Coordinator restart

**As a** PAI operator restarting the coordinator
**I want to** the dashboard to automatically reconnect to SSE
**So that** I don't need to refresh the page manually

**Acceptance Criteria:**
- [ ] SSE reconnection attempt starts within 5 seconds of connection drop
- [ ] Dashboard shows "reconnecting" status briefly
- [ ] Full dashboard data refreshes after SSE reconnects (catch up on missed events)

## Functional Requirements

### FR-1: SSE endpoint at /api/events/stream

Create a new HTTP endpoint at `/api/events/stream` that:
- Accepts GET requests
- Returns HTTP 200 with `Content-Type: text/event-stream`
- Sets `Cache-Control: no-cache`
- Sends events indefinitely until client closes connection

**Validation:** curl to endpoint returns SSE format, browser DevTools shows connection in Network tab.

### FR-2: Event polling and streaming

Coordinator polls `events` table every 2 seconds:
- Track last_event_id per SSE connection (or global last_sent_id)
- Query events where id > last_sent_id
- Format new events as SSE messages (format: `data: {JSON}`)
- Send with event ID: `id: {event.id}`

**Validation:** Query database every 2 seconds, send new events only (not duplicates).

### FR-3: SSE message format

Each event sent in SSE format:
```
id: 42
event: work_item_claimed
data: {"id": 42, "timestamp": "...", "event_type": "work_item_claimed", "actor_id": "...", "target_id": "...", "summary": "..."}

```

**Validation:** Browser console shows messages arriving in correct format, JSON parses without error.

### FR-4: Dashboard EventSource connection

Update F-17 dashboard to:
- Attempt to connect to `/api/events/stream` using EventSource API
- Listen for message events
- Parse JSON and prepend new events to events table
- On error/close, fall back to polling (or reconnect with backoff)

**Validation:** Browser Network tab shows single EventSource connection, events appear instantly.

### FR-5: Connection status indicator (optional)

Dashboard shows connection status:
- "Connected" (green) - SSE connected
- "Disconnected" (red) - SSE down, polling fallback
- "Reconnecting..." (yellow) - Attempting to reconnect

**Validation:** Visual indicator updates when connection changes.

### FR-6: Graceful degradation

If SSE endpoint is unavailable:
- Dashboard falls back to polling all data every 5 seconds (F-17 behavior)
- No errors in console
- Dashboard remains fully functional

**Validation:** Disable SSE endpoint, verify dashboard still works with polling.

## Non-Functional Requirements

- **Real-time Performance:** Events delivered <100ms from database insert (2s polling + <100ms SSE latency)
- **Scalability:** Handle 10+ simultaneous dashboard connections without coordinator load spike
- **Resource Efficiency:** Each SSE connection uses ~1KB memory, no polling waste
- **Reliability:** SSE connection auto-reconnects with exponential backoff
- **Browser Support:** Tested on modern Chrome, Firefox, Safari (all support EventSource)

## Key Entities

| Entity | SSE Data | Source |
|--------|----------|--------|
| Event | id, timestamp, event_type, actor_id, target_id, summary | SSE stream |
| Connection State | connected/disconnected/reconnecting | Dashboard state |

## Success Criteria

- [ ] `/api/events/stream` SSE endpoint created
- [ ] Endpoint polls database every 2 seconds
- [ ] New events sent as SSE messages with correct format
- [ ] Dashboard connects via EventSource
- [ ] Events appear in dashboard <100ms
- [ ] Auto-reconnect works with exponential backoff
- [ ] Fallback to polling if SSE unavailable
- [ ] No duplicate events sent

## Assumptions

| Assumption | What Would Invalidate It | Detection Strategy |
|-----------|-------------------------|-------------------|
| EventSource API supported | Very old browser | Test on target browsers |
| Database has events table with id column | Table missing or schema changed | Query schema before streaming |
| Coordinator can track last event ID | Memory leak on 1000s connections | Monitor memory, implement cleanup |

## System Context

### Upstream Dependencies

| System | What We Get | What Breaks If It Changes | Version/Contract |
|--------|-------------|---------------------------|------------------|
| F-1 Database | events table with id, timestamp columns | SSE can't query events | Schema must remain compatible |
| F-17 Dashboard | HTML/JavaScript UI | SSE can't update dashboard | HTML structure must remain compatible |

### Downstream Consumers

| System | What They Expect | Breaking Change Threshold |
|--------|-----------------|--------------------------|
| Operators/UI | Real-time event stream | SSE endpoint URL or format change |

## Out of Scope

- Authentication for SSE connections (handled by coordinator)
- Event filtering or subscription (send all events to all clients)
- Historical event replay (only new events)
- Persistent event log rotation (F-1 responsibility)
- WebSocket upgrade (SSE sufficient for read-only events)
