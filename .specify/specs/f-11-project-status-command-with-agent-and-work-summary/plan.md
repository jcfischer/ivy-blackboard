---
feature: "Project status command with agent and work summary"
spec: "./spec.md"
status: "draft"
---

# Technical Plan: Project Status Command with Agent and Work Summary

## Architecture Overview

Add `getProjectStatus` function to `src/project.ts`. Wire CLI command in `src/commands/project.ts` (stub already exists). Three queries: project lookup, active agents, work items. Format output with project details, agents list, and work items grouped by status.

```
CLI (commands/project.ts)
    |
    v
Core logic (project.ts)
    |
    ├─ getProjectStatus(db, projectId) → ProjectStatus
    |
    v
Database (3 read queries)
    ├─ SELECT FROM projects WHERE project_id = ?
    ├─ SELECT FROM agents WHERE project = ? AND status IN ('active', 'idle')
    └─ SELECT FROM work_items WHERE project_id = ?
```

## Constitutional Compliance

- [x] **CLI-First:** Command stub already exists in F-7
- [x] **Library-First:** Core logic in project.ts
- [x] **Test-First:** TDD for getProjectStatus
- [x] **Deterministic:** Same project state = same output

## Data Model

Uses existing `projects`, `agents`, and `work_items` tables. No schema changes.

### Input

```typescript
function getProjectStatus(db: Database, projectId: string): ProjectStatus;
```

### Output

```typescript
interface ProjectStatus {
  project: {
    project_id: string;
    display_name: string;
    local_path: string | null;
    remote_repo: string | null;
    registered_at: string;
    metadata: string | null;
  };
  agents: Array<{
    session_id: string;
    agent_name: string;
    status: string;
    current_work: string | null;
    started_at: string;
  }>;
  work_items: Array<{
    item_id: string;
    title: string;
    status: string;
    priority: string;
    claimed_by: string | null;
    blocked_by: string | null;
    created_at: string;
  }>;
}
```

## API Contracts

```typescript
function getProjectStatus(db: Database, projectId: string): ProjectStatus;
```

Throws `BlackboardError` with code `PROJECT_NOT_FOUND` if project doesn't exist.

## Implementation Strategy

### Phase 1: Core function
- [ ] Query project by project_id (throw if not found)
- [ ] Query active agents WHERE project = project_id AND status IN ('active', 'idle')
- [ ] Query work items WHERE project_id = project_id
- [ ] Return ProjectStatus object

### Phase 2: Wire CLI command
- [ ] Replace stub in commands/project.ts
- [ ] Parse projectId from argument
- [ ] Call getProjectStatus
- [ ] Format human output: project details, agents section, work items grouped by status
- [ ] JSON output: formatJson with ProjectStatus

## File Structure

```
src/
├── project.ts          # [Modify] Add getProjectStatus
├── commands/project.ts # [Modify] Replace status stub

tests/
├── project.test.ts     # [Modify] Add status tests
```

## Dependencies

### Internal
- F-1: Schema (projects, agents, work_items tables)
- F-7: Project register/list (project.ts module exists)
- F-3: Agent register (agents table has data)
- F-8: Work item create (work_items table has data)

## Estimated Complexity

- **New files:** 0
- **Modified files:** 2 (project.ts, commands/project.ts)
- **Test files:** 1 (modify existing)
- **Estimated tasks:** 2
