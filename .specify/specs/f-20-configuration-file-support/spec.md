---
id: "F-20"
feature: "Configuration file support"
status: "draft"
created: "2026-02-03"
---

# Specification: Configuration File Support

## Overview

The blackboard CLI needs configurable parameters for heartbeat timing, stale detection thresholds, pruning intervals, web server port, and content filtering. This feature loads configuration from `~/.pai/blackboard/config.json` with environment variable overrides and sensible defaults when no config file exists. Configuration is loaded once at CLI startup and passed to all subsystems.

## User Scenarios

### Scenario 1: Default configuration (no config file)

**As a** PAI operator who hasn't customized anything
**I want to** have sensible defaults for all configuration
**So that** the blackboard works immediately without setup

**Acceptance Criteria:**
- [ ] All config values have defaults (heartbeat: 60s, stale: 300s, prune heartbeats: 7d, prune events: 30d, port: 3141)
- [ ] Missing config file is not an error
- [ ] Missing individual fields fall back to defaults

### Scenario 2: Custom configuration

**As a** PAI operator on a slow machine
**I want to** increase the stale threshold to avoid false positives
**So that** agents under heavy load aren't incorrectly marked stale

**Acceptance Criteria:**
- [ ] `~/.pai/blackboard/config.json` is loaded on startup
- [ ] Individual fields can be overridden without specifying all fields
- [ ] Invalid config values produce clear error messages with field name and expected type
- [ ] Schema version in config is checked for forward compatibility

### Scenario 3: Environment variable overrides

**As a** PAI operator in a CI environment
**I want to** override config via environment variables
**So that** I can configure without modifying files

**Acceptance Criteria:**
- [ ] `BLACKBOARD_HEARTBEAT_INTERVAL` overrides heartbeat.intervalSeconds
- [ ] `BLACKBOARD_STALE_THRESHOLD` overrides heartbeat.staleThresholdSeconds
- [ ] `BLACKBOARD_PRUNE_AFTER` overrides sweep.pruneHeartbeatsAfterDays
- [ ] `BLACKBOARD_PORT` overrides webServer.port
- [ ] Environment variables take precedence over config file values

## Functional Requirements

### FR-1: Config schema and defaults

Define a Zod schema for the configuration with default values:

```
schemaVersion: 1
database.operatorPath: "~/.pai/blackboard/local.db"
database.projectDir: ".blackboard"
heartbeat.intervalSeconds: 60
heartbeat.staleThresholdSeconds: 300
sweep.pruneHeartbeatsAfterDays: 7
sweep.pruneEventsAfterDays: 30
sweep.pruneCompletedAgentsAfterDays: 1
webServer.port: 3141
webServer.host: "127.0.0.1"
contentFilter.maxFieldLength: 500
contentFilter.stripCodeBlocks: true
contentFilter.stripHtmlTags: true
```

**Validation:** Parsing an empty object produces all defaults. Parsing partial config merges with defaults.

### FR-2: Config file loading

Load from `~/.pai/blackboard/config.json`. Parse with Zod schema. Handle: file missing (use defaults), file invalid JSON (error with path), file valid JSON but invalid schema (error with field details).

**Validation:** Create config with one override, load, verify override applied and defaults preserved.

### FR-3: Environment variable overrides

After loading config file, apply environment variable overrides. Env vars are parsed as numbers where the config field is numeric.

**Validation:** Set `BLACKBOARD_STALE_THRESHOLD=600`, load config, verify staleThresholdSeconds is 600.

### FR-4: Config accessor

Export a `loadConfig()` function that returns the fully resolved config object. Cache the result — config is loaded once per CLI invocation.

**Validation:** Multiple calls to loadConfig() return same object. Config object has all expected fields.

## Non-Functional Requirements

- **Performance:** Config loading under 5ms
- **Security:** Config file path is hardcoded to `~/.pai/blackboard/config.json` — no user-supplied path for config
- **Failure Behavior:**
  - On missing config file: Use defaults silently
  - On invalid JSON: Error with file path and parse error
  - On invalid schema: Error with field name, expected type, actual value
  - On invalid env var value (non-numeric for numeric field): Warning, ignore override

## Key Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| Config | Full resolved configuration | All fields with defaults applied |
| ConfigFile | Raw JSON from disk | Partial, may have missing fields |
| EnvOverrides | Environment variable values | Key-value pairs |

## Success Criteria

- [ ] Config loads with all defaults when no file exists
- [ ] Partial config file merges correctly with defaults
- [ ] Environment variables override config file values
- [ ] Invalid config produces actionable error messages
- [ ] Config loaded once and cached per CLI invocation
- [ ] Zod schema validates all fields

## Assumptions

| Assumption | What Would Invalidate It | Detection Strategy |
|-----------|-------------------------|-------------------|
| `~/.pai/` directory exists or can be created | Restricted home dir | Error on load |
| Config file is valid JSON when present | Binary corruption | JSON.parse error handling |

## System Context

### Upstream Dependencies

| System | What We Get | What Breaks If It Changes | Version/Contract |
|--------|-------------|---------------------------|------------------|
| Zod | Schema validation | API changes | ^3.x |
| OS filesystem | File I/O for config.json | Path changes | POSIX |

### Downstream Consumers

| System | What They Expect | Breaking Change Threshold |
|--------|-----------------|--------------------------|
| F-1 Database init | database.operatorPath, database.projectDir | Path field names |
| F-6 Stale detection | heartbeat.staleThresholdSeconds | Field name/type |
| F-16 Web server | webServer.port, webServer.host | Field name/type |
| F-14 Content filter | contentFilter.* fields | Field name/type |

## Out of Scope

- Config file creation wizard (operator edits manually or uses defaults)
- Config reload during execution (restart CLI for changes)
- Per-project config overrides (only operator-wide config)
- Config migration between schema versions (future concern)
