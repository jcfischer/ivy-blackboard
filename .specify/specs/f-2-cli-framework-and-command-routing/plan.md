---
feature: "CLI framework and command routing"
spec: "./spec.md"
status: "draft"
---

# Technical Plan: CLI Framework and Command Routing

## Architecture Overview

The CLI uses Commander.js with a main entry point (`index.ts`) that registers global options and subcommand groups. Each command group (agent, project, work, observe, serve, sweep, status) is a separate module that exports a registration function. A middleware layer resolves the database and passes it to handlers.

```
src/index.ts (entry point, shebang)
    |
    ├─ Global options: --json, --db, --version
    |
    ├─ registerAgentCommands(program)      # stubs for F-3/4/5
    ├─ registerProjectCommands(program)    # stubs for F-7
    ├─ registerWorkCommands(program)       # stubs for F-8/9/10
    ├─ registerObserveCommand(program)     # stub for F-12
    ├─ registerServeCommand(program)       # stub for F-16
    ├─ registerSweepCommand(program)       # stub for F-6
    └─ registerStatusCommand(program)      # stub for F-13
    |
    v
Command handler receives: { db: Database, options: GlobalOptions, args }
    |
    v
Output via: formatOutput(data, options.json)
```

## Technology Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Language | TypeScript | PAI standard |
| Runtime | Bun | PAI standard |
| CLI framework | Commander.js | PAI standard, proven with other projects |
| Validation | Zod | Input validation for command args |

## Constitutional Compliance

- [x] **CLI-First:** This IS the CLI
- [x] **Library-First:** Command handlers are thin wrappers around library functions
- [x] **Test-First:** E2E tests for CLI invocation, unit tests for output formatting
- [x] **Deterministic:** Command routing is static
- [x] **Code Before Prompts:** No AI in CLI framework

## Data Model

### TypeScript interfaces

```typescript
interface GlobalOptions {
  json: boolean;
  db?: string;
}

interface CommandContext {
  db: Database;
  options: GlobalOptions;
}

// JSON envelope for all command output
interface JsonEnvelope<T> {
  ok: boolean;
  count?: number;
  items?: T[];
  error?: string;
  timestamp: string;  // ISO 8601
}
```

## API Contracts

### Internal APIs

```typescript
// Output formatting
function formatJson<T>(data: T | T[], ok?: boolean): string;
function formatTable(headers: string[], rows: string[][]): string;
function formatOutput<T>(data: T, jsonMode: boolean): void;

// Command group registration (each feature implements this pattern)
type RegisterCommands = (program: Command, getContext: () => CommandContext) => void;

// Error handling wrapper
function withErrorHandling(
  handler: (ctx: CommandContext, ...args: any[]) => Promise<void>,
  ctx: CommandContext
): (...args: any[]) => Promise<void>;
```

## Implementation Strategy

### Phase 1: Entry point and global options

- [ ] `src/index.ts` with shebang `#!/usr/bin/env bun`
- [ ] Commander.js program with name, version, description
- [ ] Global options: `--json`, `--db <path>`
- [ ] Version from package.json

### Phase 2: Output utilities

- [ ] `src/output.ts` — `formatJson()`, `formatTable()`, `formatOutput()`
- [ ] JSON envelope: `{ ok, count?, items?, error?, timestamp }`
- [ ] Table formatting with column alignment
- [ ] Error output in both modes

### Phase 3: Database middleware

- [ ] `getContext()` function that resolves DB path and opens database
- [ ] Lazy initialization (don't open DB until command needs it)
- [ ] Close database on process exit
- [ ] Pass context to all command handlers

### Phase 4: Command group stubs

- [ ] Register all 7 command groups with placeholder handlers
- [ ] Each stub prints "Not yet implemented" / returns `{ ok: false, error: "not implemented" }`
- [ ] `blackboard --help` shows all groups
- [ ] `blackboard agent --help` shows subcommand list

## File Structure

```
src/
├── index.ts            # [New] CLI entry point
├── output.ts           # [New] Output formatting utilities
├── errors.ts           # [New] Error types and handler
├── commands/
│   ├── agent.ts        # [New] Stub command group
│   ├── project.ts      # [New] Stub command group
│   ├── work.ts         # [New] Stub command group
│   ├── observe.ts      # [New] Stub command group
│   ├── serve.ts        # [New] Stub command group
│   ├── sweep.ts        # [New] Stub command group
│   └── status.ts       # [New] Stub command group

tests/
├── cli.test.ts         # [New] E2E: --help, --version, --json
├── output.test.ts      # [New] Unit: formatJson, formatTable
```

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Commander.js incompatibility with Bun | High | Low | Tested in other PAI projects (kai-launcher) |
| Slow startup from importing all command modules | Medium | Low | Lazy imports per command group |

## Failure Mode Analysis

| Failure Mode | Trigger | Detection | Degradation | Recovery |
|-------------|---------|-----------|-------------|----------|
| Commander.js parse error | Malformed args | Commander catches | Shows help text | User fixes args |
| Database open fails | Missing permissions, corrupt DB | openDatabase throws | Structured error output | User fixes DB |
| Unknown command | Typo | Commander's default handling | Error with help | User checks --help |

### Blast Radius

- **Files touched:** ~10 new files
- **Systems affected:** None (foundation)
- **Rollback strategy:** Remove src/ directory

## Dependencies

### External

- `commander` — CLI framework (needs `bun add commander`)
- `zod` — validation (needs `bun add zod`)

### Internal

- F-1 `db.ts` — `openDatabase()`, `resolveDbPath()`

## Migration/Deployment

- [ ] Install commander and zod: `bun add commander zod`
- [ ] Add bin entry to package.json: `"blackboard": "src/index.ts"`
- [ ] No breaking changes (greenfield)

## Estimated Complexity

- **New files:** ~10
- **Modified files:** ~1 (package.json)
- **Test files:** ~2
- **Estimated tasks:** ~6
- **Debt score:** 1 (standard CLI pattern)

## Longevity Assessment

### Maintainability Indicators

| Indicator | Status | Notes |
|-----------|--------|-------|
| **Readability:** | Yes | Standard Commander.js pattern used across PAI |
| **Testability:** | Yes | CLI testable via subprocess, formatters via unit tests |
| **Documentation:** | Yes | --help is self-documenting |

### Evolution Vectors

| What Might Change | Preparation | Impact |
|------------------|-------------|--------|
| New command groups | Registration pattern makes adding trivial | Low |
| Shell completions | Commander.js supports this as add-on | Low |
| MCP dual mode | Same pattern as KAI tools | Medium |

### Deletion Criteria

- [ ] Feature superseded by: GUI-only interface
- [ ] Maintenance cost exceeds value when: never (this is the interface)
