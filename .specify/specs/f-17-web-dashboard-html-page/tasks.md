---
feature: "Web Dashboard HTML Page"
plan: "./plan.md"
status: "pending"
total_tasks: 3
completed: 0
---

# Tasks: Web Dashboard HTML Page

## Legend

- `[T]` - Test required (TDD mandatory - write test FIRST)
- `[P]` - Can run in parallel with other [P] tasks in same group
- `depends: T-X.Y` - Must complete after specified task(s)

## Task Groups

### Group 1: HTML Dashboard Implementation

- [ ] **T-1.1** Create dashboard.html with layout and styling [T]
  - File: `src/web/dashboard.html`
  - Test: `tests/web/dashboard.test.ts` (contract test for HTML structure)
  - Description: Create single-file HTML dashboard with:
    - DOCTYPE, meta tags, charset, viewport
    - Header with title and timestamp placeholder
    - Four sections: status, agents, work items, events
    - Embedded CSS with flexbox grid, semantic table layouts, monospace font
    - Status badge classes (.status-ok, .status-warn, .status-error)
    - Responsive mobile-friendly styling
    - All styling inline in `<style>` tag (no external files)
  - Acceptance: HTML is valid (no errors in console), sections render with correct structure

- [ ] **T-1.2** Add JavaScript for API fetching and DOM rendering (depends: T-1.1) [T]
  - File: `src/web/dashboard.html` (JavaScript section)
  - Test: `tests/web/dashboard.test.ts` (verify fetch calls, DOM updates)
  - Description: Implement vanilla JavaScript:
    - `fetchData(endpoint)` using Fetch API with error handling
    - `formatTime(timestamp)` for "X seconds/minutes/hours ago"
    - `renderStatus(data)` returning HTML table for status badge
    - `renderAgents(data)` returning HTML table for agents
    - `renderWork(data)` returning HTML table for work items
    - `renderEvents(data)` returning HTML table for events
    - `refresh()` function that fetches all 4 endpoints and updates DOM
    - `setInterval(refresh, 5000)` for auto-refresh
    - All CSS classes and color coding per spec (green=active, yellow=idle, red=error)
  - Acceptance: Dashboard fetches from `/api/status`, `/api/agents`, `/api/work`, `/api/events` and renders tables without errors

- [ ] **T-2.1** Integration test: serve HTML and verify content [T] (depends: T-1.1) [P]
  - File: `tests/web/dashboard.test.ts`
  - Description: Write integration test that:
    - Starts coordinator HTTP server (or uses mock)
    - Loads dashboard.html via HTTP GET
    - Verifies response is valid HTML5
    - Verifies `<h1>ivy-blackboard Dashboard</h1>` is present
    - Verifies four sections exist: status, agents, work items, events
    - Verifies CSS is embedded in `<style>` tag
    - Verifies JavaScript is embedded in `<script>` tag
    - Mocks `/api/*` endpoints and verifies fetch calls are made
    - Verifies DOM updates when mock data is returned
  - Acceptance: Test passes, coverage includes happy path and error cases

## Dependency Graph

```
T-1.1 ──┬──> T-1.2
         └──> T-2.1
```

## Execution Order

1. **T-1.1** (in parallel with test setup)
2. **T-1.2** (after T-1.1)
3. **T-2.1** (after T-1.1, can start while T-1.2 in progress)

## Progress Tracking

| Task | Status | Started | Completed | Notes |
|------|--------|---------|-----------|-------|
| T-1.1 | pending | - | - | |
| T-1.2 | pending | - | - | |
| T-2.1 | pending | - | - | |

## TDD Enforcement (MANDATORY)

**CRITICAL:** Every task marked [T] MUST follow the RED-GREEN-BLUE cycle.

### The TDD Cycle

For each task marked [T]:

1. **RED:** Write failing test FIRST (verify test fails on empty implementation)
2. **GREEN:** Write MINIMAL implementation to pass
3. **BLUE:** Refactor while keeping tests green
4. **VERIFY:** Run full test suite (`bun test`)

### Test Coverage Requirements

- Contract test verifies HTML structure
- Integration test verifies fetch behavior and DOM updates
- Error handling test verifies graceful failure when API unavailable

## Blockers & Issues

| Task | Issue | Resolution |
|------|-------|------------|
| - | - | - |

## Post-Implementation Verification

### Functional Verification
- [ ] Dashboard.html loads in browser without errors
- [ ] All four sections render: status, agents, work items, events
- [ ] Tables display with correct column headers
- [ ] Status badges display with correct colors
- [ ] Auto-refresh works: network tab shows requests every 5 seconds
- [ ] Data updates in DOM without page reload

### Error Handling Verification
- [ ] Stop coordinator, verify dashboard shows "Unable to load [section]" gracefully
- [ ] Break one API endpoint, verify other sections still update
- [ ] Restart coordinator, verify dashboard recovers automatically

### Browser Verification
- [ ] Tested on Chrome (latest)
- [ ] Tested on Firefox (latest)
- [ ] Tested on Safari (if available)
- [ ] Mobile responsive layout verified (media queries work)

### Code Quality Verification
- [ ] HTML is semantic and accessible (proper heading hierarchy, alt text if needed)
- [ ] CSS is organized and readable (no unused styles)
- [ ] JavaScript is clean (no console errors, proper error handling)
- [ ] No external dependencies or build steps
- [ ] File size under 100KB

### Sign-off
- [ ] All verification items checked
- Date completed: ___
