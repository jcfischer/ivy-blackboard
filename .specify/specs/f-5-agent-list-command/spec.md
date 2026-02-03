---
id: "F-5"
feature: "Agent list command"
status: "draft"
created: "2026-02-03"
---

# Specification: Agent List Command

## Overview

Implement the `blackboard agent list` command. Lists agent sessions from the agents table with human-readable table output and JSON envelope output. By default shows only active/idle agents; `--all` includes completed and stale. Supports `--status` filter for specific status values.

## User Scenarios

### Scenario 1: List active agents

**As a** PAI agent starting work
**I want to** see who else is active
**So that** I can avoid duplicating work

**Acceptance Criteria:**
- [ ] `blackboard agent list` shows agents with status active or idle
- [ ] Table columns: SESSION, NAME, PROJECT, STATUS, LAST SEEN, PID
- [ ] LAST SEEN shows relative time ("2 min ago", "1h ago")
- [ ] "No active agents." message when no agents match

### Scenario 2: List all agents

**As a** PAI operator reviewing session history
**I want to** see all agents including completed and stale
**So that** I can audit past sessions

**Acceptance Criteria:**
- [ ] `--all` flag includes completed and stale agents
- [ ] Status column clearly shows each agent's state

### Scenario 3: Filter by status

**As a** PAI operator investigating stale agents
**I want to** filter agents by status
**So that** I can quickly find problem sessions

**Acceptance Criteria:**
- [ ] `--status active` shows only active agents
- [ ] `--status stale` shows only stale agents
- [ ] Multiple statuses: `--status active,idle` shows both
- [ ] Invalid status value produces error

### Scenario 4: JSON output

**As a** PAI agent querying the blackboard programmatically
**I want to** get agent list as JSON
**So that** I can parse and act on the data

**Acceptance Criteria:**
- [ ] `--json` output follows `{ ok, count, items, timestamp }` envelope
- [ ] Each item has all agent fields (session_id, agent_name, pid, parent_id, project, current_work, status, started_at, last_seen_at)

## Functional Requirements

### FR-1: Default agent listing

Query agents table for status IN ('active', 'idle'). Order by last_seen_at DESC. Format as ASCII table using existing `formatTable` from output.ts.

**Validation:** Register two agents, list, verify both appear in table.

### FR-2: --all flag

Query all agents regardless of status. Same ordering and formatting.

**Validation:** Register agent, deregister it, `list --all` shows it as completed.

### FR-3: --status filter

Parse comma-separated status values. Validate each against allowed statuses. Query with status IN (...).

**Validation:** Register agents with different statuses, filter, verify correct results.

### FR-4: Relative time formatting

Convert ISO 8601 timestamps to human-readable relative time: "just now", "2 min ago", "1h ago", "3d ago".

**Validation:** Format various timestamps, verify output strings.

## Non-Functional Requirements

- **Performance:** Query under 10ms for typical agent counts (<100)
- **Ordering:** Most recently seen agents first

## Key Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| Agent | Session to display | All agent fields |

## Success Criteria

- [ ] Default list shows active/idle agents only
- [ ] --all shows all statuses
- [ ] --status filters correctly (including comma-separated)
- [ ] Table output is aligned with correct columns
- [ ] Relative time display works correctly
- [ ] JSON output follows envelope format
- [ ] Empty result shows appropriate message

## Out of Scope

- Agent details view (individual agent deep-dive)
- Delegate tree visualization (parent-child hierarchy)
