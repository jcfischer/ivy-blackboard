---
id: "F-11"
feature: "Project status command with agent and work summary"
status: "draft"
created: "2026-02-03"
---

# Specification: Project Status Command with Agent and Work Summary

## Overview

Implement `blackboard project status <id>` showing project details, active agents working on it, and work items grouped by status. Joins across agents, work_items, and projects tables. Provides comprehensive project health view.

## User Scenarios

### Scenario 1: View project status

**As a** PAI operator monitoring a project
**I want to** see comprehensive project status
**So that** I understand which agents are active and what work is in progress

**Acceptance Criteria:**
- [ ] `blackboard project status <id>` shows project details
- [ ] Lists active agents (status IN active, idle) with their current work
- [ ] Shows work items grouped by status (available, claimed, completed, blocked)
- [ ] Non-existent project produces clear error
- [ ] Human output: project details, then AGENTS section, then WORK ITEMS section

### Scenario 2: JSON output

**As a** PAI agent querying project state programmatically
**I want to** get structured project status
**So that** I can make decisions about where to focus

**Acceptance Criteria:**
- [ ] `--json` follows `{ ok, project, agents, work_items, timestamp }` envelope
- [ ] project: full project row
- [ ] agents: array of active agents with session_id, agent_name, status, current_work
- [ ] work_items: array of work items with grouping by status

### Scenario 3: Empty project status

**As a** PAI operator viewing a newly registered project
**I want to** see appropriate empty state messages
**So that** I know the query worked but there's no activity

**Acceptance Criteria:**
- [ ] Project with no agents shows "No active agents"
- [ ] Project with no work items shows "No work items"
- [ ] JSON output includes empty arrays

## Functional Requirements

### FR-1: Project lookup

Query projects table by project_id. If not found, throw BlackboardError with project ID in message.

**Validation:** Query non-existent project_id, verify error message.

### FR-2: Active agents query

Query agents WHERE project = project_id AND status IN ('active', 'idle'). Include session_id, agent_name, status, current_work. Order by started_at ASC.

**Validation:** Register agents on project, verify they appear in status output.

### FR-3: Work items query

Query work_items WHERE project_id = project_id. Include all fields. Group results by status in output.

**Validation:** Create work items with different statuses, verify grouping in output.

### FR-4: Combined output formatting

Human format:
```
Project: <display_name> (<project_id>)
Path: <local_path>
Repo: <remote_repo>
Registered: <registered_at>

ACTIVE AGENTS (N):
  • <agent_name> (<session_id>) - <status> - <current_work>

WORK ITEMS:
  Available (N):
    • [<item_id>] <title> - <priority>
  Claimed (N):
    • [<item_id>] <title> - <claimed_by> - <priority>
  Completed (N):
    • [<item_id>] <title> - <priority>
  Blocked (N):
    • [<item_id>] <title> - <blocked_by> - <priority>
```

**Validation:** Manual inspection of output formatting.

## Non-Functional Requirements

- **Performance:** Single query per entity type (3 queries total)
- **Atomicity:** No transaction needed (read-only queries)

## Key Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| Project | Project details | project_id, display_name, local_path, remote_repo |
| Agent | Active agents | session_id, agent_name, status, current_work |
| WorkItem | Work items | item_id, title, status, priority, claimed_by, blocked_by |

## Success Criteria

- [ ] Status command shows project details
- [ ] Lists active agents with current work
- [ ] Groups work items by status
- [ ] Non-existent project produces clear error
- [ ] Empty states handled appropriately
- [ ] JSON output follows envelope pattern
- [ ] Human output is readable and well-formatted

## Out of Scope

- Historical project metrics (cumulative work completed, agent hours)
- Work item history per project
- Real-time project monitoring / watching
- Project deregistration
