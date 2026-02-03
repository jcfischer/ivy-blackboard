# Documentation: F-20 Configuration File Support

## Files Created

| File | Purpose |
|------|---------|
| `src/config.ts` | Zod schema, file loading, env overrides, caching |

## Files Modified

| File | Change |
|------|--------|
| `src/db.ts` | Uses `loadConfig()` for `database.projectDir` and `database.operatorPath` instead of hardcoded values |

## Usage

### Default configuration (no file needed)

All settings have sensible defaults. The blackboard works without any config file.

### Custom configuration

Create `~/.pai/blackboard/config.json` with any subset of fields:

```json
{
  "heartbeat": {
    "staleThresholdSeconds": 600
  },
  "webServer": {
    "port": 8080
  }
}
```

### Environment variable overrides

| Variable | Config Path | Default |
|----------|------------|---------|
| `BLACKBOARD_HEARTBEAT_INTERVAL` | heartbeat.intervalSeconds | 60 |
| `BLACKBOARD_STALE_THRESHOLD` | heartbeat.staleThresholdSeconds | 300 |
| `BLACKBOARD_PRUNE_AFTER` | sweep.pruneHeartbeatsAfterDays | 7 |
| `BLACKBOARD_PORT` | webServer.port | 3141 |

Environment variables take precedence over config file values.

## API Reference

### `loadConfig(configPath?): BlackboardConfig`
Load, validate, and cache configuration. Returns cached value on subsequent calls.

### `resetConfigCache(): void`
Clear config cache. Used for test isolation.

### `loadConfigFromFile(path): Record<string, unknown>`
Load raw JSON from file. Returns `{}` if missing. Throws on invalid JSON.

### `applyEnvOverrides(config): Record<string, any>`
Apply environment variable overrides to a partial config object.

### `BlackboardConfigSchema`
Zod schema with all defaults. `BlackboardConfigSchema.parse({})` returns fully populated config.

## Default Values

| Field | Default |
|-------|---------|
| schemaVersion | 1 |
| database.operatorPath | ~/.pai/blackboard/local.db |
| database.projectDir | .blackboard |
| heartbeat.intervalSeconds | 60 |
| heartbeat.staleThresholdSeconds | 300 |
| sweep.pruneHeartbeatsAfterDays | 7 |
| sweep.pruneEventsAfterDays | 30 |
| sweep.pruneCompletedAgentsAfterDays | 1 |
| webServer.port | 3141 |
| webServer.host | 127.0.0.1 |
| contentFilter.maxFieldLength | 500 |
| contentFilter.stripCodeBlocks | true |
| contentFilter.stripHtmlTags | true |
