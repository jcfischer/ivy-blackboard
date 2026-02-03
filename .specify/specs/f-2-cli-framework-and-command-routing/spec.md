---
id: "F-2"
feature: "CLI framework and command routing"
status: "draft"
created: "2026-02-03"
---

# Specification: CLI Framework and Command Routing

## Overview

The `blackboard` CLI is the primary interface for all blackboard operations. This feature sets up the Commander.js-based entry point with global flags (`--json`, `--db <path>`), database resolution chain, and subcommand routing for all command groups (agent, project, work, observe, serve, sweep, status). Each subcommand group is a separate module that registers its commands. The CLI follows PAI conventions: TypeScript, Bun, Commander.js, Zod validation.

## User Scenarios

### Scenario 1: Running the CLI

**As a** PAI operator
**I want to** run `blackboard <command>` from any directory
**So that** I can coordinate agents without switching context

**Acceptance Criteria:**
- [ ] `blackboard --help` shows all available commands and global options
- [ ] `blackboard --version` shows the current version
- [ ] `blackboard status` works as a default command
- [ ] Unknown commands show error with suggestions

### Scenario 2: JSON output for programmatic use

**As a** PAI hook or script
**I want to** use `--json` to get machine-parseable output from any command
**So that** I can integrate the blackboard into automated workflows

**Acceptance Criteria:**
- [ ] `--json` flag available on all commands
- [ ] JSON output follows the envelope format: `{ ok, count?, items?, timestamp }`
- [ ] Non-JSON output is human-readable with formatted tables
- [ ] `--json` suppresses any non-JSON output (no logs mixed in)

### Scenario 3: Database override

**As a** PAI operator with multiple blackboard databases
**I want to** specify which database to use with `--db`
**So that** I can query any blackboard regardless of my current directory

**Acceptance Criteria:**
- [ ] `--db /path/to/db` overrides all other resolution
- [ ] Relative paths resolve from cwd
- [ ] Error if specified path is not writable
- [ ] Database resolution chain: --db > $BLACKBOARD_DB > .blackboard/local.db > ~/.pai/blackboard/local.db

## Functional Requirements

### FR-1: Commander.js program setup

Create the main program with name "blackboard", version from package.json, description. Register global options: `--json` (boolean), `--db <path>` (string).

**Validation:** `blackboard --help` shows program info and global options.

### FR-2: Subcommand registration

Register command groups: `agent`, `project`, `work`, `observe`, `serve`, `sweep`, `status`. Each group is a separate module that exports a function receiving the parent Command and global options. Stub commands initially (they'll be implemented in later features).

**Validation:** `blackboard agent --help` shows agent subcommands.

### FR-3: Database context middleware

Before each command executes, resolve the database path using the resolution chain and open the database. Pass the database handle to command handlers. Close database on command completion.

**Validation:** Command handler receives initialized database. Database closed after handler returns.

### FR-4: Output formatting

Implement output utilities: `formatTable(headers, rows)` for human output, `formatJson(data)` for JSON envelope. Commands use these based on `--json` flag.

**Validation:** Human output aligns columns. JSON output parses as valid JSON matching envelope schema.

### FR-5: Error handling

Catch all command errors. In JSON mode, output `{ ok: false, error: "message" }`. In human mode, output colored error message. Exit with non-zero code on errors.

**Validation:** Invalid command args produce structured error in JSON mode, readable error in human mode.

## Non-Functional Requirements

- **Performance:** CLI startup under 50ms (no heavy imports at top level)
- **Security:** No command accepts arbitrary code execution. All inputs validated with Zod.
- **Failure Behavior:**
  - On database unavailable: Clear error with resolution path tried
  - On invalid arguments: Zod validation error with field-level detail
  - On unknown subcommand: Error with "did you mean?" suggestions

## Key Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| Program | Commander.js root | name, version, global options |
| Command group | Subcommand tree (agent, work, etc.) | name, subcommands, handler |
| Global options | Shared across all commands | --json, --db |
| Output envelope | JSON response format | ok, count, items, timestamp |

## Success Criteria

- [ ] `blackboard --help` displays all command groups
- [ ] `--json` flag produces valid JSON envelope on all commands
- [ ] `--db` flag overrides database resolution
- [ ] Database resolution chain works correctly (4 levels)
- [ ] Errors produce clean output in both human and JSON modes
- [ ] CLI startup time under 50ms
- [ ] Bun shebang works (`#!/usr/bin/env bun`)

## Assumptions

| Assumption | What Would Invalidate It | Detection Strategy |
|-----------|-------------------------|-------------------|
| Commander.js works with Bun | Incompatibility | Test in CI |
| Bun resolves shebangs correctly | Bun shebang bug | Test `blackboard` binary |

## System Context

### Upstream Dependencies

| System | What We Get | What Breaks If It Changes | Version/Contract |
|--------|-------------|---------------------------|------------------|
| F-1 Database init | openDatabase(), resolveDbPath() | API changes | Internal |
| Commander.js | CLI framework | Breaking API changes | ^12.x |
| Zod | Input validation | Breaking API changes | ^3.x |

### Downstream Consumers

| System | What They Expect | Breaking Change Threshold |
|--------|-----------------|--------------------------|
| F-3 Agent commands | Command group registration API | Registration signature |
| F-7 Project commands | Command group registration API | Registration signature |
| F-8 Work commands | Command group registration API | Registration signature |
| All command features | Global options parsed, database opened | Options structure |

## Out of Scope

- Individual command implementations (F-3 through F-13)
- Shell completions
- Config file loading (F-20)
- Interactive/REPL mode
