---
id: "F-7"
feature: "Project register and list commands"
status: "draft"
created: "2026-02-03"
---

# Specification: Project Register and List Commands

## Overview

Implement the `blackboard project register` and `blackboard project list` commands. Register inserts a project row in the projects table with a slug ID, display name, optional path and repo. List shows all registered projects with active agent count. Both commands support --json output.

## User Scenarios

### Scenario 1: Register a project

**As a** PAI operator setting up a new project
**I want to** register it on the blackboard
**So that** agents can associate their work with it

**Acceptance Criteria:**
- [ ] `blackboard project register --id "pai-collab" --name "PAI Collab" --path "/Users/fischer/work/pai-collab" --repo "mellanon/pai-collab"` creates project row
- [ ] --id and --name are required; --path and --repo are optional
- [ ] Emits `project_registered` event
- [ ] Human output shows project_id, display_name, path, repo
- [ ] JSON output follows `{ ok, ... }` envelope
- [ ] Duplicate project_id produces clear error

### Scenario 2: List projects

**As a** PAI agent choosing which project to work on
**I want to** see all registered projects
**So that** I can pick one to focus on

**Acceptance Criteria:**
- [ ] `blackboard project list` shows all projects
- [ ] Table columns: PROJECT, NAME, PATH, REPO, AGENTS
- [ ] AGENTS column shows count of active agents for each project
- [ ] "No projects registered." when empty
- [ ] JSON output follows `{ ok, count, items, timestamp }` envelope

### Scenario 3: Register with metadata

**As a** PAI operator tracking additional project context
**I want to** store metadata with the project
**So that** agents can access branch info, status, etc.

**Acceptance Criteria:**
- [ ] `--metadata '{"branch": "main", "status": "active"}'` stored as JSON text
- [ ] Invalid JSON in --metadata produces clear error
- [ ] Metadata available in JSON output

## Functional Requirements

### FR-1: Project registration

Insert into projects table. Generate registered_at as current ISO 8601 timestamp. Emit `project_registered` event. All in one transaction.

**Validation:** Register project, query projects table, verify row with correct values.

### FR-2: Duplicate detection

Primary key constraint on project_id catches duplicates. Produce friendly error message.

**Validation:** Register same project_id twice, verify error message mentions the ID.

### FR-3: Project listing with agent counts

Query projects table with LEFT JOIN to agents (status IN active, idle) grouped by project. Show count per project.

**Validation:** Register project, register agent on that project, list, verify agent count is 1.

### FR-4: Metadata handling

Parse --metadata as JSON. Store in metadata column. Invalid JSON produces error before insert.

**Validation:** Register with valid metadata, verify stored. Register with invalid metadata, verify error.

## Non-Functional Requirements

- **Atomicity:** Registration is a single transaction with event
- **Performance:** List query under 10ms

## Key Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| Project | Registered project | project_id, display_name, local_path, remote_repo |
| Event | Audit trail | event_type: project_registered |

## Success Criteria

- [ ] Register creates project row with all fields
- [ ] Register emits project_registered event
- [ ] Duplicate project_id produces clear error
- [ ] List shows all projects with active agent counts
- [ ] Metadata stored and retrievable
- [ ] Both commands support --json output
- [ ] Empty list shows appropriate message

## Out of Scope

- Project status command with agents and work items (F-11)
- Project deregistration / archiving
- Auto-detection of project from current directory
