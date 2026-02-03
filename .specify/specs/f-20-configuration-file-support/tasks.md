---
feature: "Configuration file support"
plan: "./plan.md"
status: "pending"
total_tasks: 5
completed: 0
---

# Tasks: Configuration File Support

## Legend

- `[T]` - Test required (TDD mandatory - write test FIRST)
- `[P]` - Can run in parallel with other [P] tasks in same group
- `depends: T-X.Y` - Must complete after specified task(s)

## Task Groups

### Group 1: Schema and defaults

- [ ] **T-1.1** Define Zod config schema with defaults [T]
  - File: `src/config.ts`
  - Test: `tests/config.test.ts`
  - Description: Define `BlackboardConfigSchema` using Zod with all nested objects and defaults. Fields: `schemaVersion` (default 1), `database.operatorPath` (default `~/.pai/blackboard/local.db`), `database.projectDir` (default `.blackboard`), `heartbeat.intervalSeconds` (default 60), `heartbeat.staleThresholdSeconds` (default 300), `sweep.pruneHeartbeatsAfterDays` (default 7), `sweep.pruneEventsAfterDays` (default 30), `sweep.pruneCompletedAgentsAfterDays` (default 1), `webServer.port` (default 3141), `webServer.host` (default `127.0.0.1`), `contentFilter.maxFieldLength` (default 500), `contentFilter.stripCodeBlocks` (default true), `contentFilter.stripHtmlTags` (default true). Export `BlackboardConfig` type inferred from schema.

### Group 2: Loading and overrides

- [ ] **T-2.1** Implement config file loading [T] (depends: T-1.1)
  - File: `src/config.ts`
  - Test: `tests/config.test.ts`
  - Description: `loadConfigFromFile(): Partial<BlackboardConfig>` — read `~/.pai/blackboard/config.json`. If file missing, return `{}`. If invalid JSON, throw with file path. If valid JSON, return parsed object (not yet validated through Zod).

- [ ] **T-2.2** Implement environment variable overrides [T] (depends: T-1.1)
  - File: `src/config.ts`
  - Test: `tests/config.test.ts`
  - Description: `applyEnvOverrides(config: Partial<BlackboardConfig>): Partial<BlackboardConfig>` — check env vars: `BLACKBOARD_HEARTBEAT_INTERVAL`, `BLACKBOARD_STALE_THRESHOLD`, `BLACKBOARD_PRUNE_AFTER`, `BLACKBOARD_PORT`. Parse as integers. If `isNaN`, warn and skip. Merge into config object (env takes precedence).

### Group 3: Public API and integration

- [ ] **T-3.1** Implement loadConfig with caching [T] (depends: T-2.1, T-2.2)
  - File: `src/config.ts`
  - Test: `tests/config.test.ts`
  - Description: `loadConfig(): BlackboardConfig` — load from file, apply env overrides, validate through Zod schema (which applies defaults), cache result. Subsequent calls return cached object. `resetConfigCache(): void` for test isolation. Exported as the public API.

- [ ] **T-3.2** Integrate config into db.ts path resolution [T] (depends: T-3.1)
  - File: `src/db.ts` (modify)
  - Test: `tests/db.test.ts` (add cases)
  - Description: Update `resolveDbPath()` to use `loadConfig().database.operatorPath` and `loadConfig().database.projectDir` instead of hardcoded paths. Config provides defaults that can be overridden by --db flag and $BLACKBOARD_DB env var (which still take precedence).

## Dependency Graph

```
T-1.1 ──┬──> T-2.1 ──┐
         │            ├──> T-3.1 ──> T-3.2
         └──> T-2.2 ──┘
```

## Execution Order

1. **T-1.1** Zod schema with defaults
2. **Parallel:** T-2.1, T-2.2 (after T-1.1)
3. **Sequential:** T-3.1 (after T-2.1 and T-2.2)
4. **Sequential:** T-3.2 (after T-3.1)

## Progress Tracking

| Task | Status | Started | Completed | Notes |
|------|--------|---------|-----------|-------|
| T-1.1 | pending | - | - | |
| T-2.1 | pending | - | - | |
| T-2.2 | pending | - | - | |
| T-3.1 | pending | - | - | |
| T-3.2 | pending | - | - | |

## TDD Enforcement (MANDATORY)

**CRITICAL:** Every task marked [T] MUST follow the RED-GREEN-BLUE cycle.

### Test Notes

Tests use temp directories for config files. Set/unset env vars in test setup/teardown. Call `resetConfigCache()` between tests to ensure isolation. Test partial configs (one field overridden, rest default).

## Blockers & Issues

| Task | Issue | Resolution |
|------|-------|------------|
| - | - | - |

## Post-Implementation Verification

### Functional Verification
- [ ] Missing config file produces all defaults
- [ ] Partial config merges correctly
- [ ] Env vars override file values
- [ ] Invalid JSON produces actionable error
- [ ] Invalid schema values produce field-level error
- [ ] Config cached after first load

### Failure Verification (Doctorow Gate)
- [ ] **Failure test:** Corrupt config.json produces clear error with path
- [ ] **Failure test:** Non-numeric env var warns and is ignored
- [ ] **Rollback test:** Deleting config.ts — hardcoded defaults in db.ts still work

### Maintainability Verification
- [ ] Zod schema is the single source of truth for config shape
- [ ] Adding a new config field is one Zod field + one default

### Sign-off
- [ ] All verification items checked
- Date completed: ___
