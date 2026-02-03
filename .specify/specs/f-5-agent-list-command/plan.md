---
feature: "Agent list command"
spec: "./spec.md"
status: "draft"
---

# Technical Plan: Agent List Command

## Architecture Overview

Add a `listAgents` function to `src/agent.ts` that queries the agents table with optional status filtering. Add a `formatRelativeTime` utility to `src/output.ts` for human-readable timestamps. Wire into the existing list stub in `src/commands/agent.ts`.

```
CLI (commands/agent.ts list subcommand)
    |
    v
Core logic (agent.ts)
    |
    └─ listAgents(db, opts) → BlackboardAgent[]
    |
    v
Output formatting (output.ts)
    |
    └─ formatRelativeTime(isoString) → "2 min ago"
```

## Constitutional Compliance

- [x] **CLI-First:** Command already stubbed
- [x] **Library-First:** Core query in agent.ts, formatting in output.ts
- [x] **Test-First:** TDD for query and formatting

## Data Model

Reads from existing `agents` table. No schema changes.

### List options

```typescript
interface ListAgentsOptions {
  all?: boolean;
  status?: string; // comma-separated: "active,idle"
}
```

## API Contracts

```typescript
function listAgents(db: Database, opts?: ListAgentsOptions): BlackboardAgent[];
function formatRelativeTime(isoString: string): string;
```

## Implementation Strategy

### Phase 1: Relative time formatting
- [ ] Add `formatRelativeTime` to output.ts
- [ ] Handles: "just now", "Xs ago", "Xm ago", "Xh ago", "Xd ago"

### Phase 2: Core list function
- [ ] Default: status IN ('active', 'idle')
- [ ] --all: no status filter
- [ ] --status: parse comma-separated, validate against allowed values
- [ ] Order by last_seen_at DESC

### Phase 3: Wire CLI command
- [ ] Replace list stub with listAgents → formatTable with relative time
- [ ] Columns: SESSION (truncated), NAME, PROJECT, STATUS, LAST SEEN, PID

## File Structure

```
src/
├── agent.ts            # [Modify] Add listAgents
├── output.ts           # [Modify] Add formatRelativeTime
├── commands/agent.ts   # [Modify] Replace list stub

tests/
├── agent.test.ts       # [Modify] Add list tests
├── output.test.ts      # [Modify] Add formatRelativeTime tests
```

## Dependencies

### Internal
- F-3: agent.ts module (registerAgent for test setup)
- F-2: output.ts (formatTable, printOutput)

## Estimated Complexity

- **New files:** 0
- **Modified files:** 3 (agent.ts, output.ts, commands/agent.ts)
- **Test files:** 2 (modify)
- **Estimated tasks:** 4
