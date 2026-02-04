---
feature: "Spoke export integration"
plan: "./plan.md"
status: "pending"
total_tasks: 2
completed: 0
---

# Tasks: Spoke Export Integration

## Legend

- `[T]` - Test required (TDD mandatory - write test FIRST)
- `[P]` - Can run in parallel with other [P] tasks in same group
- `depends: T-X.Y` - Must complete after specified task(s)

## Task Groups

### Group 1: Export function

- [ ] **T-1.1** Create exportSnapshot function [T]
  - File: `src/export.ts`
  - Test: `tests/export.test.ts`
  - Description: Implement `exportSnapshot(db: Database, dbPath: string, opts?: ExportOptions): ExportSnapshot` that calls core functions (getOverallStatus, listAgents, listProjects, listWorkItems, observeEvents with limit 100). Compose results into complete ExportSnapshot object with export_version 1, timestamp, database info, status aggregates, and all entity arrays. Include file size calculation via fs.statSync(dbPath).size. Tests cover: snapshot assembly, all fields present, JSON serializability, empty database handling.

### Group 2: CLI command

- [ ] **T-2.1** Wire export CLI command [T] (depends: T-1.1)
  - File: `src/commands/export.ts`
  - Test: `tests/commands/export.test.ts`
  - Description: Create CLI command handler for `blackboard export [--pretty] [--output <file>]`. Parse options with Zod. Call exportSnapshot. Format JSON with pretty-printing if --pretty. Write to file if --output provided (atomic write with temp file). Exit 0 on success, 1 on error. Tests cover: option parsing, pretty formatting, file I/O, error handling (bad path, write failure), both stdout and file output.

## Dependency Graph

```
T-1.1 ──> T-2.1
```

## Execution Order

1. T-1.1 (export function with tests)
2. T-2.1 (CLI command with tests, depends T-1.1)

## Progress Tracking

| Task | Status | Started | Completed | Notes |
|------|--------|---------|-----------|-------|
| T-1.1 | pending | - | - | Export snapshot function |
| T-2.1 | pending | - | - | CLI command wiring |

## TDD Enforcement (MANDATORY)

**CRITICAL:** Every task marked [T] MUST follow the RED-GREEN-BLUE cycle.

### The TDD Cycle

For each task marked [T]:

1. **RED:** Write failing test FIRST
2. **GREEN:** Write MINIMAL implementation to pass
3. **BLUE:** Refactor while keeping tests green
4. **VERIFY:** Run full test suite (`bun test`)

### Test Coverage Requirements

- **Minimum ratio:** 0.3 (test files / source files)
- **Every source file** should have a corresponding test file

## Blockers & Issues

| Task | Issue | Resolution |
|------|-------|------------|
| - | - | - |

## Post-Implementation Verification

### Functional Verification
- [ ] Export function returns valid ExportSnapshot object
- [ ] JSON output is valid and parseable
- [ ] `--pretty` flag produces indented JSON
- [ ] `--output <file>` writes to file atomically
- [ ] Command succeeds on empty database
- [ ] Recent events limited to 100

### Failure Verification (Doctorow Gate)
- [ ] **Failure test:** File not writable produces clear error
- [ ] **Failure test:** Database unreachable produces clear error
- [ ] **Failure test:** Invalid option produces usage help
- [ ] **Rollback test:** Deleting export file leaves database unchanged

### Maintainability Verification
- [ ] Export logic is composition of core functions (no data duplication)
- [ ] TypeScript types match ExportSnapshot interface exactly
- [ ] No orphan code

### Sign-off
- [ ] All verification items checked
- Date completed: ___
