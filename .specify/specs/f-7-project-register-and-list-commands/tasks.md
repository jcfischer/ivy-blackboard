---
feature: "Project register and list commands"
plan: "./plan.md"
status: "pending"
total_tasks: 4
completed: 0
---

# Tasks: Project Register and List Commands

## Legend

- `[T]` - Test required (TDD mandatory - write test FIRST)
- `depends: T-X.Y` - Must complete after specified task(s)

## Task Groups

### Group 1: Core register function

- [ ] **T-1.1** Implement registerProject core function [T]
  - File: `src/project.ts` (new)
  - Test: `tests/project.test.ts` (new)
  - Description: Create `registerProject(db, opts: RegisterProjectOptions)` that inserts into projects table with registered_at = current ISO 8601. If opts.metadata is provided, validate it's valid JSON (throw if not). Emit `project_registered` event with project_id and display_name in summary. All in one transaction. Handle UNIQUE constraint on project_id with friendly error. Returns `RegisterProjectResult`.

- [ ] **T-1.2** Handle duplicate and metadata edge cases [T] (depends: T-1.1)
  - File: `src/project.ts`
  - Test: `tests/project.test.ts`
  - Description: Test duplicate project_id produces BlackboardError with the ID in message. Test invalid JSON in --metadata throws with parse error. Test metadata stored and retrievable. Test registration with only required fields (--id, --name).

### Group 2: Core list function

- [ ] **T-2.1** Implement listProjects core function [T] (depends: T-1.1)
  - File: `src/project.ts`
  - Test: `tests/project.test.ts`
  - Description: Create `listProjects(db): ProjectWithCounts[]` that queries projects with LEFT JOIN to agents WHERE agents.status IN ('active', 'idle') AND agents.project = projects.project_id, GROUP BY project_id. Returns array with active_agents count per project. Order by registered_at DESC.

### Group 3: Wire CLI commands

- [ ] **T-3.1** Wire register and list CLI commands [T] (depends: T-1.1, T-2.1)
  - File: `src/commands/project.ts` (modify)
  - Test: `tests/project.test.ts`
  - Description: Replace register stub: parse --id (required), --name (required), --path, --repo, --metadata. Call registerProject. Human output: show project_id, display_name, path, repo. JSON: formatJson. Replace list stub: call listProjects. Human output: formatTable with columns PROJECT, NAME, PATH, REPO, AGENTS. Empty: "No projects registered." JSON: formatJson with count and items.

## Dependency Graph

```
T-1.1 ──┬──> T-1.2
         ├──> T-2.1 ──> T-3.1
         └─────────────/
```

## Execution Order

1. **T-1.1** Core registerProject
2. **Parallel:** T-1.2, T-2.1 (after T-1.1)
3. **T-3.1** Wire CLI (after T-1.1, T-2.1)

## Progress Tracking

| Task | Status | Started | Completed | Notes |
|------|--------|---------|-----------|-------|
| T-1.1 | pending | - | - | |
| T-1.2 | pending | - | - | |
| T-2.1 | pending | - | - | |
| T-3.1 | pending | - | - | |

## TDD Enforcement (MANDATORY)

### Test Notes

Tests use temp databases with full schema. For agent count tests, register agents with project field matching project_id. Verify LEFT JOIN returns 0 for projects with no agents.
