---
id: "F-17"
feature: "Web Dashboard HTML Page"
status: "draft"
created: "2026-02-03"
---

# Specification: Web Dashboard HTML Page

## Overview

The ivy-blackboard coordinator needs a real-time web dashboard to monitor agent activity, work distribution, and system events. This feature creates a single self-contained HTML file (no build step, no framework dependencies) that fetches data from coordinator API endpoints and renders it with vanilla HTML/CSS/JavaScript. The dashboard auto-refreshes every 5 seconds to reflect current system state.

This is the primary operator interface for monitoring the blackboard.

## User Scenarios

### Scenario 1: View system status at a glance

**As a** PAI operator
**I want to** open a single HTML file in my browser and see overall coordinator status
**So that** I can quickly assess if all systems are operational

**Acceptance Criteria:**
- [ ] Dashboard loads without build step or external dependencies
- [ ] Overall status badge shows (OK/Warning/Error) based on agent health
- [ ] Active agent count and total agents displayed
- [ ] Work queue depth shown (available, claimed, completed)

### Scenario 2: Monitor active agents

**As a** PAI operator
**I want to** see a table of all active agents with their current work items
**So that** I can identify stalled or misbehaving agents

**Acceptance Criteria:**
- [ ] Table shows: agent_name, status (active/idle/completed/stale), current_work, last_seen
- [ ] Status badges color-coded (green=active, yellow=idle, red=stale)
- [ ] Timestamp shows "X seconds ago" format
- [ ] Table auto-updates every 5 seconds

### Scenario 3: Monitor work items

**As a** PAI operator
**I want to** see work items broken down by status and priority
**So that** I can understand queue depth and identify blocking work

**Acceptance Criteria:**
- [ ] Table shows: item_id (short ID or title), status, priority, claimed_by, created_at
- [ ] Grouped by status (available/claimed/completed/blocked) or shown in single table with filter
- [ ] Priority badges color-coded (P1=red, P2=yellow, P3=green)
- [ ] Table auto-updates every 5 seconds

### Scenario 4: View recent events

**As a** PAI operator
**I want to** see recent system events (agent started, work claimed, etc.)
**So that** I can understand what the system is doing in real-time

**Acceptance Criteria:**
- [ ] List shows: timestamp, event_type, actor_id, target_id, summary
- [ ] Most recent events appear first
- [ ] Timestamps show "X seconds ago" format
- [ ] List updates every 5 seconds (or via SSE in F-18)

## Functional Requirements

### FR-1: Single HTML file with embedded CSS and JavaScript

Create `/src/web/dashboard.html` with all styles and logic embedded. No external CSS/JS files, no npm build.

**Validation:** File is valid HTML5, opens in browser without errors, no 404s for resources.

### FR-2: Layout and design

Dashboard has a clean, minimal design with:
- Header showing overall status and timestamp
- Four-section grid: Status, Agents, Work Items, Events
- Monospace font (Monaco, Courier) for technical data
- Light background, dark text or dark mode option
- Responsive mobile-friendly layout

**Validation:** Layout readable on desktop and mobile, visual inspection confirms clean design.

### FR-3: API integration

Dashboard fetches data from coordinator endpoints:
- `/api/status` - Returns overall status (count of agents, work items, events)
- `/api/agents` - Returns list of agents with session_id, name, status, current_work, last_seen
- `/api/work` - Returns list of work items with item_id, title, status, priority, claimed_by
- `/api/events` - Returns recent events (timestamp, event_type, actor_id, target_id, summary)

**Validation:** Dashboard makes XHR/fetch calls to each endpoint, renders returned JSON.

### FR-4: Auto-refresh every 5 seconds

Dashboard uses `setInterval(fetch_and_render, 5000)` to refresh all data. Each section independently updates.

**Validation:** Browser network tab shows requests every 5 seconds, DOM updates without page reload.

### FR-5: Status badges

Color-coded status indicators:
- Agent status: active (green), idle (yellow), stale (red), completed (gray)
- Work priority: P1 (red), P2 (yellow), P3 (green)
- Overall status: OK (green), Warning (yellow), Error (red)

**Validation:** Badges render with correct colors per status value.

### FR-6: Responsive error handling

If API fetch fails, dashboard displays "Unable to load [section]" with last-updated timestamp, does not crash.

**Validation:** Kill coordinator, verify dashboard shows error gracefully, can recover when coordinator restarts.

## Non-Functional Requirements

- **Performance:** Dashboard renders in <500ms on first load, <100ms on subsequent refreshes
- **Accessibility:** Semantic HTML, proper contrast ratios, keyboard navigation (optional)
- **Browser Support:** Chrome, Firefox, Safari (modern versions)
- **File Size:** <100KB (HTML+CSS+JS combined)
- **Offline Resilience:** If API is unavailable, displays "Unable to connect" gracefully

## Key Entities

| Entity | Display Fields | Source |
|--------|---|---|
| Overall Status | Agent count, Work queue depth, Last updated | `/api/status` |
| Agent | name, status, current_work, last_seen, pid | `/api/agents` |
| Work Item | item_id/title, status, priority, claimed_by, created_at | `/api/work` |
| Event | timestamp, event_type, actor_id, target_id, summary | `/api/events` |

## Success Criteria

- [ ] Single HTML file at `/src/web/dashboard.html` created
- [ ] Dashboard loads in browser without errors
- [ ] All four sections render data from API
- [ ] Auto-refresh works (5 second interval verified)
- [ ] Status badges display correct colors
- [ ] Layout is clean, readable, responsive
- [ ] Error states handled gracefully

## Assumptions

| Assumption | What Would Invalidate It | Detection Strategy |
|-----------|-------------------------|-------------------|
| Coordinator has HTTP server running | Server is down | Test with coordinator running |
| API endpoints return JSON | Endpoint returns HTML error | Test with real coordinator |
| Browser supports Fetch API | Very old browser | Test on target browsers |

## System Context

### Upstream Dependencies

| System | What We Get | What Breaks If It Changes | Version/Contract |
|--------|-------------|---------------------------|------------------|
| Coordinator HTTP server | `/api/status`, `/api/agents`, `/api/work`, `/api/events` endpoints | Dashboard can't fetch data | Endpoints must return JSON |
| Browser | Fetch, DOM API, setTimeout | Dashboard doesn't work | Modern browser (ES2020+) |

### Downstream Consumers

| System | What They Expect | Breaking Change Threshold |
|--------|-----------------|--------------------------|
| F-18 SSE Updates | HTML structure compatible with EventSource | HTML structure change |
| Operator/User | Web dashboard accessible at coordinator root or `/dashboard` | UI redesign acceptable |

## Out of Scope

- Authentication/authorization (handled by coordinator)
- Real-time SSE updates (F-18)
- Historical data export or dashboards
- Agent control (start/stop/pause)
- Dark mode toggle (optional enhancement)
- Mobile app
