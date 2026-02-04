---
feature: "Web Dashboard HTML Page"
spec: "./spec.md"
status: "draft"
---

# Technical Plan: Web Dashboard HTML Page

## Architecture Overview

A single self-contained HTML file (`src/web/dashboard.html`) that:
1. Defines semantic HTML structure with sections for status, agents, work items, events
2. Embeds all CSS (no framework, vanilla styles with flexbox grid)
3. Embeds all JavaScript (vanilla Fetch API, DOM manipulation, setInterval)
4. On page load: fetches from `/api/status`, `/api/agents`, `/api/work`, `/api/events`
5. On load + every 5 seconds: refetch and update DOM
6. No build step, no dependencies beyond browser

```
Browser
  |
  v
dashboard.html (opened via file:// or http://localhost:PORT/dashboard.html)
  |
  ├─ fetch /api/status      → render header with agent/work counts
  ├─ fetch /api/agents      → render agents table with status badges
  ├─ fetch /api/work        → render work items table with priorities
  ├─ fetch /api/events      → render recent events list
  |
  └─ setInterval(fetch + render, 5000ms)
```

## Technology Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Markup | HTML5 semantic tags | No build required, native browser support |
| Styling | CSS3 (Flexbox, Grid) | No CSS framework, light and responsive |
| Scripting | Vanilla JavaScript (ES2020) | No frameworks, minimal footprint |
| API Communication | Fetch API with error handling | Native browser API, simple and reliable |
| Data Format | JSON | Standard, no parsing required beyond JSON.parse |

## Constitutional Compliance

- [x] **Library-First:** Not applicable (UI layer, not library)
- [x] **CLI Interface:** Not applicable (UI layer, not CLI)
- [x] **Test-First:** Integration tests validate HTML structure and fetch behavior
- [x] **Simplicity Gate:** No frameworks, single file, no dependencies
- [x] **Anti-Abstraction Gate:** Direct DOM manipulation, no wrapper libraries

## HTML Structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ivy-blackboard Dashboard</title>
  <style>
    /* Embedded CSS */
    * { box-sizing: border-box; }
    body { font-family: Monaco, monospace; background: #f5f5f5; color: #333; }
    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
    .section { background: white; padding: 20px; margin: 15px 0; border-radius: 4px; }
    .header { display: flex; justify-content: space-between; align-items: center; }
    .status-badge { display: inline-block; padding: 4px 8px; border-radius: 3px; }
    .status-ok { background: #4caf50; color: white; }
    .status-warn { background: #ff9800; color: white; }
    .status-error { background: #f44336; color: white; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
    .loading { color: #666; font-style: italic; }
    .error { color: #f44336; }
  </style>
</head>
<body>
  <div class="container">
    <header class="header">
      <h1>ivy-blackboard Dashboard</h1>
      <div id="timestamp"></div>
    </header>

    <section class="section">
      <h2>Overall Status</h2>
      <div id="status-content"></div>
    </section>

    <section class="section">
      <h2>Active Agents</h2>
      <div id="agents-content"></div>
    </section>

    <section class="section">
      <h2>Work Items</h2>
      <div id="work-content"></div>
    </section>

    <section class="section">
      <h2>Recent Events</h2>
      <div id="events-content"></div>
    </section>
  </div>

  <script>
    // Embedded JavaScript
    const API_BASE = window.location.origin;
    const REFRESH_INTERVAL = 5000;

    async function fetchData(endpoint) {
      try {
        const response = await fetch(`${API_BASE}/api/${endpoint}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
      } catch (error) {
        console.error(`Failed to fetch /${endpoint}:`, error);
        return null;
      }
    }

    function formatTime(timestamp) {
      const date = new Date(timestamp);
      const seconds = Math.floor((Date.now() - date) / 1000);
      if (seconds < 60) return `${seconds}s ago`;
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return `${minutes}m ago`;
      const hours = Math.floor(minutes / 60);
      return `${hours}h ago`;
    }

    function renderStatus(data) {
      if (!data) {
        return '<div class="error">Unable to load status</div>';
      }
      const statusClass = data.agent_count > 0 ? 'status-ok' : 'status-warn';
      return `
        <div>
          <span class="status-badge ${statusClass}">
            ${data.agent_count} agents |
            ${data.available_work} available |
            ${data.claimed_work} claimed |
            ${data.completed_work} completed
          </span>
        </div>
      `;
    }

    function renderAgents(data) {
      if (!data || data.length === 0) {
        return '<p class="loading">No agents</p>';
      }
      const rows = data.map(agent => {
        const statusColor = agent.status === 'active' ? 'status-ok' :
                           agent.status === 'idle' ? 'status-warn' : 'status-error';
        return `
          <tr>
            <td>${agent.agent_name}</td>
            <td><span class="status-badge ${statusColor}">${agent.status}</span></td>
            <td>${agent.current_work || '—'}</td>
            <td>${formatTime(agent.last_seen_at)}</td>
            <td>${agent.pid || '—'}</td>
          </tr>
        `;
      }).join('');
      return `
        <table>
          <thead>
            <tr>
              <th>Agent</th>
              <th>Status</th>
              <th>Current Work</th>
              <th>Last Seen</th>
              <th>PID</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `;
    }

    function renderWork(data) {
      if (!data || data.length === 0) {
        return '<p class="loading">No work items</p>';
      }
      const rows = data.map(item => {
        const priorityColor = item.priority === 'P1' ? 'status-error' :
                             item.priority === 'P2' ? 'status-warn' : 'status-ok';
        const statusColor = item.status === 'available' ? 'status-ok' :
                           item.status === 'claimed' ? 'status-warn' :
                           item.status === 'blocked' ? 'status-error' : 'status-ok';
        return `
          <tr>
            <td>${item.item_id.substring(0, 8)}</td>
            <td>${item.title || '—'}</td>
            <td><span class="status-badge ${statusColor}">${item.status}</span></td>
            <td><span class="status-badge ${priorityColor}">${item.priority}</span></td>
            <td>${item.claimed_by || '—'}</td>
            <td>${formatTime(item.created_at)}</td>
          </tr>
        `;
      }).join('');
      return `
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Title</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Claimed By</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `;
    }

    function renderEvents(data) {
      if (!data || data.length === 0) {
        return '<p class="loading">No events</p>';
      }
      return `
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Event</th>
              <th>Actor</th>
              <th>Target</th>
              <th>Summary</th>
            </tr>
          </thead>
          <tbody>
            ${data.map(event => `
              <tr>
                <td>${formatTime(event.timestamp)}</td>
                <td>${event.event_type}</td>
                <td>${event.actor_id || '—'}</td>
                <td>${event.target_id || '—'}</td>
                <td>${event.summary}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    async function refresh() {
      const [status, agents, work, events] = await Promise.all([
        fetchData('status'),
        fetchData('agents'),
        fetchData('work'),
        fetchData('events')
      ]);

      document.getElementById('timestamp').textContent = new Date().toLocaleTimeString();
      document.getElementById('status-content').innerHTML = renderStatus(status);
      document.getElementById('agents-content').innerHTML = renderAgents(agents);
      document.getElementById('work-content').innerHTML = renderWork(work);
      document.getElementById('events-content').innerHTML = renderEvents(events);
    }

    // Initial load
    refresh();

    // Auto-refresh every 5 seconds
    setInterval(refresh, REFRESH_INTERVAL);
  </script>
</body>
</html>
```

## API Contracts

The dashboard expects the coordinator to provide these JSON endpoints:

### GET /api/status

```json
{
  "agent_count": 3,
  "available_work": 5,
  "claimed_work": 2,
  "completed_work": 10
}
```

### GET /api/agents

```json
[
  {
    "session_id": "abc123",
    "agent_name": "researcher-1",
    "status": "active",
    "current_work": "item-456",
    "last_seen_at": "2026-02-03T12:34:56Z",
    "pid": 1234
  }
]
```

### GET /api/work

```json
[
  {
    "item_id": "item-001",
    "title": "Research climate impact",
    "status": "claimed",
    "priority": "P1",
    "claimed_by": "researcher-1",
    "created_at": "2026-02-03T10:00:00Z"
  }
]
```

### GET /api/events

```json
[
  {
    "timestamp": "2026-02-03T12:35:00Z",
    "event_type": "agent_started",
    "actor_id": "researcher-1",
    "target_id": null,
    "summary": "Agent researcher-1 started with PID 1234"
  }
]
```

## File Structure

```
src/
├── web/
│   └── dashboard.html    # [New] Single self-contained dashboard file

tests/
├── web/
│   └── dashboard.test.ts # [New] Integration tests for HTML structure and fetch calls
```

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Coordinator endpoints unavailable | Dashboard shows error | Low | Error handling in fetch, graceful degradation |
| CORS issues between file:// and http:// | Dashboard can't fetch | Medium | Coordinator must serve dashboard or allow CORS |
| Large API responses slow refresh | Refresh takes >5s | Low | Limit events/agents returned by coordinator |
| Browser compatibility (old Fetch) | Works on modern browsers | Low | Target modern browsers (Chrome 41+) |

## Failure Mode Analysis

| Failure Mode | Trigger | Detection | Degradation | Recovery |
|-------------|---------|-----------|-------------|----------|
| Coordinator down | HTTP request fails | console.error | "Unable to load [section]" | Restart coordinator |
| Invalid JSON response | Endpoint returns HTML error | JSON.parse throws | Section shows error | Fix endpoint |
| CORS blocked | fetch rejected by browser | console.error | Blank dashboard | Configure CORS on coordinator |
| Page left open during sleep | Browser background timeout | Next refresh fails gracefully | "Unable to load" message | Refresh page |

## Dependencies

### External
- Browser: Fetch API, DOM API, setTimeout (all native)
- Coordinator: HTTP server with `/api/*` endpoints

### Internal
- None (standalone UI file)

## Estimated Complexity

- **New files:** 1 (dashboard.html)
- **Modified files:** 0
- **Test files:** 1 (dashboard.test.ts)
- **Estimated tasks:** 3
- **Debt score:** 0 (single file, no technical debt)

## Longevity Assessment

### Maintainability Indicators

| Indicator | Status | Notes |
|-----------|--------|-------|
| **Readability:** Can a developer understand in 6 months? | Yes | Single file, embedded CSS/JS, comments provided |
| **Testability:** Can changes be verified without manual testing? | Yes | Integration tests for structure and fetch |
| **Documentation:** Is the "why" captured? | Yes | HTML structure self-documenting |

### Evolution Vectors

| What Might Change | Preparation | Impact |
|------------------|-------------|--------|
| Add new data section | HTML section + fetch + render | Low |
| Change refresh interval | Update REFRESH_INTERVAL constant | Low |
| Add real-time SSE updates | Replace setInterval with EventSource (F-18) | Medium |
| Style redesign | CSS is centralized | Low |

### Deletion Criteria

- [ ] Feature superseded by: external monitoring dashboard
- [ ] Dependency deprecated: browser drops Fetch API
- [ ] User need eliminated: operators no longer need monitoring
