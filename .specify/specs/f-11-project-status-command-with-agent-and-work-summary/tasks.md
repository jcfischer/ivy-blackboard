---
feature: "Project status command with agent and work summary"
plan: "./plan.md"
status: "pending"
total_tasks: 2
completed: 0
---

# Tasks: Project Status Command with Agent and Work Summary

## Legend

- `[T]` - Test required (TDD mandatory - write test FIRST)
- `depends: T-X.Y` - Must complete after specified task(s)

## Task Groups

### Group 1: Core function

- [ ] **T-1.1** Implement getProjectStatus core function [T]
  - File: `src/project.ts` (modify)
  - Test: `tests/project.test.ts` (modify)
  - Description: Create `getProjectStatus(db: Database, projectId: string): ProjectStatus`. Query project by project_id - throw BlackboardError with code PROJECT_NOT_FOUND if not found. Query agents WHERE project = projectId AND status IN ('active', 'idle'), order by started_at ASC. Query work_items WHERE project_id = projectId, include all fields. Return ProjectStatus object with project, agents array, work_items array. Test with non-existent project (verify error), project with no agents (empty array), project with no work items (empty array), project with full data (verify all sections populated).

### Group 2: Wire CLI command

- [ ] **T-2.1** Wire project status CLI command [T] (depends: T-1.1)
  - File: `src/commands/project.ts` (modify)
  - Test: `tests/project.test.ts` (modify)
  - Description: Replace status command stub. Parse projectId from argument. Call getProjectStatus with error handling. Human output: project header (display_name, project_id, path, repo, registered_at), "ACTIVE AGENTS (N):" section with bullet list (agent_name, session_id, status, current_work), "WORK ITEMS:" section grouped by status (Available/Claimed/Completed/Blocked with counts), each item shows [item_id] title - priority/claimed_by/blocked_by. Empty states: "No active agents" and "No work items." JSON output: formatJson with ProjectStatus. Test with project_id argument, verify human output formatting, verify JSON envelope.

## Dependency Graph

```
T-1.1 ──> T-2.1
```

## Execution Order

1. **T-1.1** Core getProjectStatus
2. **T-2.1** Wire CLI (after T-1.1)

## Progress Tracking

| Task | Status | Started | Completed | Notes |
|------|--------|---------|-----------|-------|
| T-1.1 | pending | - | - | |
| T-2.1 | pending | - | - | |

## TDD Enforcement (MANDATORY)

### Test Notes

Tests use temp databases with full schema. For agent tests, register agents with project field matching project_id and various statuses. For work item tests, create items with different statuses (available, claimed, completed, blocked). Verify ProjectStatus object structure matches TypeScript interface. CLI tests use Bun.spawn with --json flag to verify output envelope.
