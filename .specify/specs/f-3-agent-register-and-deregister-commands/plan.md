---
feature: "Agent register and deregister commands"
spec: "./spec.md"
status: "draft"
---

# Technical Plan: Agent Register and Deregister Commands

## Architecture Overview

Replace the stub implementations in `src/commands/agent.ts` for the `register` and `deregister` subcommands. Core logic lives in a new `src/agent.ts` module with pure functions (`registerAgent`, `deregisterAgent`) that take a Database and options, execute transactional SQL, and return result objects. The command handlers in `src/commands/agent.ts` parse CLI options, call the core functions, and format output.

```
CLI (commands/agent.ts)
    |
    v
Core logic (agent.ts)
    |
    ├─ registerAgent(db, opts) → { session_id, agent_name, ... }
    └─ deregisterAgent(db, sessionId) → { released_count, duration, ... }
    |
    v
Database (agents + events tables)
```

## Constitutional Compliance

- [x] **CLI-First:** Commands already wired in F-2 stubs
- [x] **Library-First:** Core logic in agent.ts, no CLI coupling
- [x] **Test-First:** TDD with transaction verification
- [x] **Deterministic:** Same inputs = same DB state
- [x] **Code Before Prompts:** No AI in registration

## Data Model

Uses existing `agents` and `events` tables from F-1 schema. No schema changes needed.

### Register input

```typescript
interface RegisterAgentOptions {
  name: string;
  project?: string;
  work?: string;
  parentId?: string;
}
```

### Register output

```typescript
interface RegisterAgentResult {
  session_id: string;
  agent_name: string;
  pid: number;
  parent_id: string | null;
  project: string | null;
  current_work: string | null;
  status: "active";
  started_at: string;
}
```

### Deregister output

```typescript
interface DeregisterAgentResult {
  session_id: string;
  agent_name: string;
  released_count: number;
  duration_seconds: number;
}
```

## API Contracts

### Internal APIs

```typescript
// Core functions (src/agent.ts)
function registerAgent(db: Database, opts: RegisterAgentOptions): RegisterAgentResult;
function deregisterAgent(db: Database, sessionId: string): DeregisterAgentResult;
```

## Implementation Strategy

### Phase 1: Core register function
- [ ] `registerAgent()` generates UUID v4, captures PID, inserts agent + event in transaction
- [ ] Returns result object with all fields

### Phase 2: Core deregister function
- [ ] `deregisterAgent()` validates session exists, updates status to completed, releases work items, emits event, all in transaction
- [ ] Calculates session duration from started_at

### Phase 3: Wire CLI commands
- [ ] Replace register stub with option parsing → registerAgent → output formatting
- [ ] Replace deregister stub with option parsing → deregisterAgent → output formatting
- [ ] Support --json via existing printOutput/formatJson helpers

## File Structure

```
src/
├── agent.ts            # [New] registerAgent, deregisterAgent core logic
├── commands/agent.ts   # [Modify] Replace stubs with real implementations

tests/
├── agent.test.ts       # [New] Core logic tests
```

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| UUID collision | Low | Negligible | crypto.randomUUID() has sufficient entropy |
| Deregister with active work items | Medium | Medium | Release in same transaction |

## Failure Mode Analysis

| Failure Mode | Trigger | Detection | Degradation | Recovery |
|-------------|---------|-----------|-------------|----------|
| Parent session doesn't exist | Invalid --parent | FK constraint error | Clear error message | User provides valid parent |
| Session already deregistered | Double deregister | Status check | No-op, return existing state | Expected behavior |

## Dependencies

### Internal
- F-1: Schema (agents, events tables)
- F-2: CLI framework (command stubs, output helpers)

## Estimated Complexity

- **New files:** 1 (agent.ts)
- **Modified files:** 1 (commands/agent.ts)
- **Test files:** 1
- **Estimated tasks:** 5
