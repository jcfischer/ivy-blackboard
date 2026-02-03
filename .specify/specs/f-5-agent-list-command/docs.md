# Documentation: F-5 Agent List Command

## Files Modified

| File | Change |
|------|--------|
| `src/agent.ts` | Added ListAgentsOptions interface and listAgents function |
| `src/output.ts` | Added formatRelativeTime utility |
| `src/commands/agent.ts` | Replaced list stub with real listAgents wiring |
| `tests/agent.test.ts` | Added 9 list tests (7 unit + 2 CLI E2E) |
| `tests/output.test.ts` | Added 4 formatRelativeTime tests |

## Usage

```bash
# List active/idle agents (default)
blackboard agent list

# List all agents including completed and stale
blackboard agent list --all

# Filter by specific status
blackboard agent list --status active
blackboard agent list --status completed
blackboard agent list --status active,idle

# JSON output
blackboard agent list --json
blackboard agent list --all --json
```

## API Reference

### `listAgents(db, opts?): BlackboardAgent[]`
Queries agents table with optional filtering. Default: active and idle only. Ordered by last_seen_at DESC.

**Options:** `all?` (boolean), `status?` (comma-separated string)

### `formatRelativeTime(isoString): string`
Converts ISO 8601 timestamp to human-readable relative time: "just now", "Xm ago", "Xh ago", "Xd ago".
