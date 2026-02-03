# Documentation: F-4 Agent Heartbeat Command

## Files Modified

| File | Change |
|------|--------|
| `src/agent.ts` | Added HeartbeatOptions, HeartbeatResult interfaces and sendHeartbeat function |
| `src/commands/agent.ts` | Replaced heartbeat stub with real sendHeartbeat wiring |
| `tests/agent.test.ts` | Added 8 heartbeat tests (unit + CLI E2E) |

## Usage

```bash
# Basic heartbeat (updates last_seen_at only)
blackboard agent heartbeat --session <session-id>

# Heartbeat with progress note (also emits event)
blackboard agent heartbeat --session <session-id> --progress "Finished schema design"

# Heartbeat with work item reference
blackboard agent heartbeat --session <session-id> --work-item <item-id> --progress "Working on task"

# JSON output
blackboard agent heartbeat --session <session-id> --progress "Status update" --json
```

## API Reference

### `sendHeartbeat(db, opts): HeartbeatResult`
Updates agent last_seen_at, inserts heartbeat row, optionally updates current_work and emits `heartbeat_received` event (only when progress is provided). All in one transaction.

**Options:** `sessionId` (required), `progress?`, `workItemId?`

**Behavior:**
- Always updates `agents.last_seen_at`
- Always inserts a `heartbeats` row
- If `progress` provided: also updates `agents.current_work` and emits event
- If no `progress`: no event emitted, no current_work change
- Works for completed/stale agents (still updates last_seen_at)
- Throws `AGENT_NOT_FOUND` for non-existent sessions
