---
feature: "Agent heartbeat command"
spec: "./spec.md"
status: "draft"
---

# Technical Plan: Agent Heartbeat Command

## Architecture Overview

Add a `sendHeartbeat` function to `src/agent.ts` (created in F-3). The function atomically updates agent's `last_seen_at`, inserts a heartbeats row, and optionally emits a `heartbeat` event (only when progress text is provided). The CLI handler in `src/commands/agent.ts` parses options and calls the core function.

```
CLI (commands/agent.ts heartbeat subcommand)
    |
    v
Core logic (agent.ts)
    |
    └─ sendHeartbeat(db, opts) → { session_id, timestamp, ... }
    |
    v
Database (agents + heartbeats + events tables)
```

## Constitutional Compliance

- [x] **CLI-First:** Command already stubbed in F-2
- [x] **Library-First:** Core logic in agent.ts
- [x] **Test-First:** TDD for all paths
- [x] **Deterministic:** Same inputs = same DB state

## Data Model

Uses existing `agents`, `heartbeats`, and `events` tables. No schema changes.

### Heartbeat input

```typescript
interface HeartbeatOptions {
  sessionId: string;
  progress?: string;
  workItemId?: string;
}
```

### Heartbeat output

```typescript
interface HeartbeatResult {
  session_id: string;
  agent_name: string;
  timestamp: string;
  progress: string | null;
}
```

## API Contracts

```typescript
function sendHeartbeat(db: Database, opts: HeartbeatOptions): HeartbeatResult;
```

## Implementation Strategy

### Phase 1: Core heartbeat function
- [ ] Validate session exists (throw if not)
- [ ] Update agent.last_seen_at and optionally agent.current_work
- [ ] Insert heartbeats row
- [ ] Emit event only if progress provided
- [ ] All in one transaction

### Phase 2: Wire CLI command
- [ ] Replace heartbeat stub with option parsing → sendHeartbeat → output formatting

## File Structure

```
src/
├── agent.ts            # [Modify] Add sendHeartbeat (depends on F-3 creating this file)
├── commands/agent.ts   # [Modify] Replace heartbeat stub

tests/
├── agent.test.ts       # [Modify] Add heartbeat tests
```

## Dependencies

### Internal
- F-1: Schema (heartbeats table)
- F-3: agent.ts module (registerAgent needed for test setup)

## Estimated Complexity

- **New files:** 0
- **Modified files:** 2 (agent.ts, commands/agent.ts)
- **Test files:** 1 (modify)
- **Estimated tasks:** 3
