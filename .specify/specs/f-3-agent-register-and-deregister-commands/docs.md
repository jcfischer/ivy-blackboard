# Documentation: F-3 Agent Register and Deregister Commands

## Files Created

| File | Purpose |
|------|---------|
| `src/agent.ts` | Core logic: registerAgent, deregisterAgent |

## Files Modified

| File | Change |
|------|--------|
| `src/commands/agent.ts` | Replaced register/deregister stubs with real implementations |

## Usage

```bash
# Register a new agent
blackboard agent register --name "Ivy" --project "pai-collab" --work "Designing schema"

# Register a delegate
blackboard agent register --name "Ivy (delegate)" --parent <session-id> --project "pai-scanning"

# Deregister (clean exit)
blackboard agent deregister --session <session-id>

# JSON output
blackboard agent register --name "Ivy" --json
blackboard agent deregister --session <id> --json
```

## API Reference

### `registerAgent(db, opts): RegisterAgentResult`
Creates agent row with UUID v4 session_id, captures PID, emits `agent_registered` event. All in one transaction.

**Options:** `name` (required), `project?`, `work?`, `parentId?`

### `deregisterAgent(db, sessionId): DeregisterAgentResult`
Sets status to `completed`, releases claimed work items, emits `agent_deregistered` event, returns session duration. Idempotent for already-completed agents.
