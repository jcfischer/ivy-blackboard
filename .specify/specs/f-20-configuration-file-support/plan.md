---
feature: "Configuration file support"
spec: "./spec.md"
status: "draft"
---

# Technical Plan: Configuration File Support

## Architecture Overview

A `config.ts` module that loads configuration from `~/.pai/blackboard/config.json`, merges with defaults using a Zod schema, and applies environment variable overrides. The result is cached — one load per CLI invocation. All subsystems receive config values through the resolved config object.

```
CLI startup
    |
    v
loadConfig()
    |
    ├─ Read ~/.pai/blackboard/config.json (if exists)
    ├─ Parse with Zod schema (merge with defaults)
    ├─ Apply env var overrides
    ├─ Cache result
    └─ Return BlackboardConfig
    |
    v
Config injected into: db.ts, sweep, serve, content-filter
```

## Technology Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Language | TypeScript | PAI standard |
| Runtime | Bun | PAI standard |
| Validation | Zod | Schema validation with defaults |

## Constitutional Compliance

- [x] **CLI-First:** Config loaded transparently on every CLI invocation
- [x] **Library-First:** `config.ts` is a pure module, no CLI coupling
- [x] **Test-First:** Unit tests for all loading paths and overrides
- [x] **Deterministic:** Same file + env = same config, always
- [x] **Code Before Prompts:** No AI in config loading

## Data Model

### TypeScript interfaces

```typescript
interface BlackboardConfig {
  schemaVersion: number;

  database: {
    operatorPath: string;    // default: "~/.pai/blackboard/local.db"
    projectDir: string;      // default: ".blackboard"
  };

  heartbeat: {
    intervalSeconds: number;         // default: 60
    staleThresholdSeconds: number;   // default: 300
  };

  sweep: {
    pruneHeartbeatsAfterDays: number;       // default: 7
    pruneEventsAfterDays: number;           // default: 30
    pruneCompletedAgentsAfterDays: number;  // default: 1
  };

  webServer: {
    port: number;    // default: 3141
    host: string;    // default: "127.0.0.1"
  };

  contentFilter: {
    maxFieldLength: number;        // default: 500
    stripCodeBlocks: boolean;      // default: true
    stripHtmlTags: boolean;        // default: true
  };
}
```

## API Contracts

### Internal APIs

```typescript
// Load and cache configuration (idempotent)
function loadConfig(): BlackboardConfig;

// Reset cache (for testing)
function resetConfigCache(): void;

// Zod schema (exported for validation in tests)
const BlackboardConfigSchema: ZodSchema<BlackboardConfig>;

// Environment variable mapping
const ENV_OVERRIDES: Record<string, keyof FlatConfig>;
```

## Implementation Strategy

### Phase 1: Zod schema with defaults

- [ ] Define `BlackboardConfigSchema` with all fields and defaults
- [ ] `schemaVersion` defaults to 1
- [ ] All nested objects have `.default({})` for partial configs
- [ ] Export the schema for test use

### Phase 2: File loading

- [ ] Read `~/.pai/blackboard/config.json`
- [ ] Handle missing file (return defaults)
- [ ] Handle invalid JSON (error with file path)
- [ ] Parse through Zod schema (validates + applies defaults)

### Phase 3: Environment variable overrides

- [ ] Map env vars to config paths:
  - `BLACKBOARD_HEARTBEAT_INTERVAL` → `heartbeat.intervalSeconds`
  - `BLACKBOARD_STALE_THRESHOLD` → `heartbeat.staleThresholdSeconds`
  - `BLACKBOARD_PRUNE_AFTER` → `sweep.pruneHeartbeatsAfterDays`
  - `BLACKBOARD_PORT` → `webServer.port`
- [ ] Parse numeric env vars, warn on invalid values
- [ ] Apply after file loading (env takes precedence)

### Phase 4: Caching and integration

- [ ] Cache resolved config in module-level variable
- [ ] `loadConfig()` returns cached value on subsequent calls
- [ ] `resetConfigCache()` for test isolation
- [ ] Wire into `db.ts` for path resolution

## File Structure

```
src/
├── config.ts           # [New] Config loading, schema, env overrides

tests/
├── config.test.ts      # [New] All loading paths, overrides, edge cases
```

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Config file has future schemaVersion | Low | Low | Check version, warn if higher than supported |
| Env var parsing produces NaN | Low | Medium | isNaN check, warn and ignore |

## Failure Mode Analysis

| Failure Mode | Trigger | Detection | Degradation | Recovery |
|-------------|---------|-----------|-------------|----------|
| Config file missing | First run, never configured | fs.existsSync check | Use all defaults | Expected behavior |
| Invalid JSON | User typo in config | JSON.parse error | Error with file path and line | User fixes JSON |
| Invalid schema values | Negative numbers, wrong types | Zod validation error | Error with field details | User fixes config |
| Env var non-numeric | `BLACKBOARD_PORT=abc` | isNaN check | Warn, ignore override | User fixes env var |

### Blast Radius

- **Files touched:** ~1 new, ~1 modified (db.ts uses config for paths)
- **Systems affected:** All features that read config (F-1, F-6, F-14, F-16)
- **Rollback strategy:** Remove config.ts, hardcode defaults everywhere

## Dependencies

### External

- `zod` — schema validation (already added by F-2)

### Internal

- None (this is consumed by other features)

## Estimated Complexity

- **New files:** ~1
- **Modified files:** ~1 (db.ts)
- **Test files:** ~1
- **Estimated tasks:** ~4
- **Debt score:** 1 (standard config pattern)

## Longevity Assessment

### Maintainability Indicators

| Indicator | Status | Notes |
|-----------|--------|-------|
| **Readability:** | Yes | Zod schema is self-documenting |
| **Testability:** | Yes | Pure function, mockable file reads |
| **Documentation:** | Yes | Config reference in architecture doc |

### Evolution Vectors

| What Might Change | Preparation | Impact |
|------------------|-------------|--------|
| New config fields | Zod schema with defaults handles additions | Low |
| Per-project config | Load from .blackboard/ in addition to ~/  | Medium |
| Config schema v2 | schemaVersion field enables migration | Low |

### Deletion Criteria

- [ ] Feature superseded by: centralized config service
- [ ] Maintenance cost exceeds value when: never (simple, essential)
