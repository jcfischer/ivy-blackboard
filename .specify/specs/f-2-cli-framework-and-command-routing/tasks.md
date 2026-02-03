---
feature: "CLI framework and command routing"
plan: "./plan.md"
status: "pending"
total_tasks: 7
completed: 0
---

# Tasks: CLI Framework and Command Routing

## Legend

- `[T]` - Test required (TDD mandatory - write test FIRST)
- `[P]` - Can run in parallel with other [P] tasks in same group
- `depends: T-X.Y` - Must complete after specified task(s)

## Task Groups

### Group 1: Dependencies and output utilities

- [ ] **T-1.1** Install dependencies and configure project [P]
  - File: `package.json`
  - Description: `bun add commander zod`. Verify Commander.js works with Bun by creating a minimal test program. Update package.json bin entry to point to `src/index.ts`.

- [ ] **T-1.2** Create output formatting module [T] [P]
  - File: `src/output.ts`
  - Test: `tests/output.test.ts`
  - Description: `formatJson<T>(data, ok?)` — wraps data in `{ ok, count?, items?, timestamp }` envelope. `formatTable(headers, rows)` — column-aligned ASCII table with padding. `formatOutput(data, jsonMode)` — dispatches to formatJson or console.log of formatTable. Error envelope: `{ ok: false, error: string, timestamp }`.

- [ ] **T-1.3** Create error handling module [T] [P]
  - File: `src/errors.ts`
  - Test: `tests/errors.test.ts`
  - Description: `BlackboardError` class extending Error with `code` field. `withErrorHandling(handler)` wrapper that catches errors and outputs them via formatJson (in JSON mode) or stderr (in human mode). Exit codes: 0 success, 1 general error, 2 invalid args.

### Group 2: Entry point and database context

- [ ] **T-2.1** Create CLI entry point [T] (depends: T-1.1, T-1.2, T-1.3)
  - File: `src/index.ts`
  - Test: `tests/cli.test.ts`
  - Description: Shebang `#!/usr/bin/env bun`. Commander.js program with name "blackboard", version from package.json, description. Global options: `-j, --json` (boolean), `--db <path>` (string). Parse and run. `blackboard --help` and `blackboard --version` work.

- [ ] **T-2.2** Implement database context middleware [T] (depends: T-2.1)
  - File: `src/context.ts`
  - Test: `tests/context.test.ts`
  - Description: `createContext(options: GlobalOptions): CommandContext` — resolves DB path from options, opens database (via F-1's openDatabase), returns `{ db, options }`. Lazy — database not opened until first access. `process.on('exit')` closes database. Commands receive context via closure.

### Group 3: Command group stubs

- [ ] **T-3.1** Register all command group stubs [T] (depends: T-2.2)
  - Files: `src/commands/agent.ts`, `src/commands/project.ts`, `src/commands/work.ts`, `src/commands/observe.ts`, `src/commands/serve.ts`, `src/commands/sweep.ts`, `src/commands/status.ts`
  - Test: `tests/cli.test.ts` (add cases)
  - Description: Each file exports a `register(program, getContext)` function. Register subcommands with descriptions matching the architecture doc. Handlers print "Not yet implemented" in human mode, return `{ ok: false, error: "not implemented" }` in JSON mode. All 7 groups: agent (register/deregister/heartbeat/list), project (register/list/status), work (claim/release/complete/list/status), observe, serve, sweep, status.

- [ ] **T-3.2** E2E test: full CLI invocation [T] (depends: T-3.1)
  - File: `tests/cli.test.ts` (add cases)
  - Description: Spawn `bun src/index.ts` as subprocess. Verify: `--help` shows all command groups, `--version` shows version, `status --json` returns valid JSON envelope, unknown command exits non-zero, `agent --help` shows subcommands. Tests use a temp database via `--db`.

## Dependency Graph

```
T-1.1 ──┐
T-1.2 ──┼──> T-2.1 ──> T-2.2 ──> T-3.1 ──> T-3.2
T-1.3 ──┘
```

## Execution Order

1. **Parallel batch 1:** T-1.1, T-1.2, T-1.3
2. **Sequential:** T-2.1 (after batch 1)
3. **Sequential:** T-2.2 (after T-2.1)
4. **Sequential:** T-3.1 (after T-2.2)
5. **Sequential:** T-3.2 (after T-3.1)

## Progress Tracking

| Task | Status | Started | Completed | Notes |
|------|--------|---------|-----------|-------|
| T-1.1 | pending | - | - | |
| T-1.2 | pending | - | - | |
| T-1.3 | pending | - | - | |
| T-2.1 | pending | - | - | |
| T-2.2 | pending | - | - | |
| T-3.1 | pending | - | - | |
| T-3.2 | pending | - | - | |

## TDD Enforcement (MANDATORY)

**CRITICAL:** Every task marked [T] MUST follow the RED-GREEN-BLUE cycle.

### Test Notes

CLI E2E tests spawn `bun src/index.ts` as a subprocess with `Bun.spawn`. Capture stdout/stderr. Use `--db <temp-path>` to isolate from real databases. Verify exit codes.

## Blockers & Issues

| Task | Issue | Resolution |
|------|-------|------------|
| - | - | - |

## Post-Implementation Verification

### Functional Verification
- [ ] `blackboard --help` shows all 7 command groups
- [ ] `blackboard --version` shows correct version
- [ ] `--json` produces valid JSON envelope on all commands
- [ ] `--db` overrides database path
- [ ] Unknown commands show error

### Failure Verification (Doctorow Gate)
- [ ] **Failure test:** Invalid --db path produces clear error
- [ ] **Failure test:** Commander parse error produces clean output
- [ ] **Rollback test:** Removing a command group file doesn't crash CLI (just missing that group)

### Maintainability Verification
- [ ] Adding a new command group is one file + one register call
- [ ] Output formatting is consistent across all commands
- [ ] No orphan imports

### Sign-off
- [ ] All verification items checked
- Date completed: ___
