---
feature: "Project register and list commands"
spec: "./spec.md"
status: "draft"
---

# Technical Plan: Project Register and List Commands

## Architecture Overview

Create a new `src/project.ts` module with `registerProject` and `listProjects` core functions. Replace the stubs in `src/commands/project.ts`. Registration inserts into the projects table with an event. Listing queries projects with a LEFT JOIN to agents for active agent counts.

```
CLI (commands/project.ts)
    |
    v
Core logic (project.ts)
    |
    ├─ registerProject(db, opts) → { project_id, ... }
    └─ listProjects(db) → ProjectWithCounts[]
    |
    v
Database (projects + agents + events tables)
```

## Constitutional Compliance

- [x] **CLI-First:** Commands already stubbed in F-2
- [x] **Library-First:** Core logic in project.ts
- [x] **Test-First:** TDD for registration and listing
- [x] **Deterministic:** Same inputs = same DB state

## Data Model

Uses existing `projects`, `agents`, and `events` tables. No schema changes.

### Register input

```typescript
interface RegisterProjectOptions {
  id: string;
  name: string;
  path?: string;
  repo?: string;
  metadata?: string; // JSON string
}
```

### Register output

```typescript
interface RegisterProjectResult {
  project_id: string;
  display_name: string;
  local_path: string | null;
  remote_repo: string | null;
  registered_at: string;
}
```

### List output

```typescript
interface ProjectWithCounts {
  project_id: string;
  display_name: string;
  local_path: string | null;
  remote_repo: string | null;
  registered_at: string;
  active_agents: number;
}
```

## API Contracts

```typescript
function registerProject(db: Database, opts: RegisterProjectOptions): RegisterProjectResult;
function listProjects(db: Database): ProjectWithCounts[];
```

## Implementation Strategy

### Phase 1: Core register function
- [ ] Insert into projects with registered_at = now
- [ ] Parse and validate --metadata as JSON if provided
- [ ] Emit `project_registered` event
- [ ] Handle duplicate project_id with friendly error
- [ ] All in one transaction

### Phase 2: Core list function
- [ ] LEFT JOIN projects to agents WHERE agents.status IN ('active', 'idle')
- [ ] GROUP BY project_id to get agent counts
- [ ] Order by registered_at DESC

### Phase 3: Wire CLI commands
- [ ] Replace register stub → registerProject → output formatting
- [ ] Replace list stub → listProjects → formatTable
- [ ] Columns: PROJECT, NAME, PATH, REPO, AGENTS

## File Structure

```
src/
├── project.ts          # [New] registerProject, listProjects
├── commands/project.ts # [Modify] Replace stubs

tests/
├── project.test.ts     # [New] Core logic tests
```

## Dependencies

### Internal
- F-1: Schema (projects, events tables)
- F-2: CLI framework (command stubs, output helpers)

## Estimated Complexity

- **New files:** 1 (project.ts)
- **Modified files:** 1 (commands/project.ts)
- **Test files:** 1
- **Estimated tasks:** 4
