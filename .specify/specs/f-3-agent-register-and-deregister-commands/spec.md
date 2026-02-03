---
id: "F-3"
feature: "Agent register and deregister commands"
status: "draft"
created: "2026-02-03"
---

# Specification: Agent Register and Deregister Commands

## Overview

Implement the `blackboard agent register` and `blackboard agent deregister` CLI commands. Register creates a new agent session row in the `agents` table with a UUID v4 session_id, captures PID, emits an `agent_registered` event, and returns the session ID. Deregister marks the agent as `completed`, releases claimed work items, emits an `agent_deregistered` event, and reports session duration.

## User Scenarios

### Scenario 1: Register a new agent session

**As a** PAI agent starting a new work session
**I want to** register myself on the blackboard
**So that** other agents can see I'm active and what I'm working on

**Acceptance Criteria:**
- [ ] `blackboard agent register --name "Ivy" --project "pai-collab" --work "Designing schema"` creates a row in agents table
- [ ] Returns generated UUID v4 session_id
- [ ] Captures current PID automatically
- [ ] Sets status to `active`, started_at and last_seen_at to now (ISO 8601)
- [ ] Emits `agent_registered` event with agent name and project in summary
- [ ] Human output shows session_id, name, project, PID, started_at
- [ ] JSON output follows `{ ok, ... }` envelope

### Scenario 2: Register a delegate (child agent)

**As a** PAI agent spawning a sub-task
**I want to** register a delegate linked to my parent session
**So that** the relationship between parent and child is tracked

**Acceptance Criteria:**
- [ ] `--parent <sessionId>` sets parent_id FK on the new agent
- [ ] Parent session must exist (FK enforced)
- [ ] Output shows parent session_id and name

### Scenario 3: Deregister (clean exit)

**As a** PAI agent finishing its work
**I want to** deregister cleanly
**So that** the blackboard reflects I'm no longer active

**Acceptance Criteria:**
- [ ] `blackboard agent deregister --session <id>` sets status to `completed`
- [ ] Releases any work items claimed by this agent (sets status back to `available`, clears claimed_by)
- [ ] Emits `agent_deregistered` event
- [ ] Reports session duration (time since started_at)
- [ ] Reports number of released work items
- [ ] Error if session_id doesn't exist

## Functional Requirements

### FR-1: Agent registration

Insert into agents table atomically with event in a single transaction. Generate UUID v4 for session_id. Capture `process.pid` for PID. All fields except name are optional. The `--session-hint` option is accepted but reserved for future stable ID generation.

**Validation:** Register agent, query agents table, verify row exists with correct values.

### FR-2: Delegate registration

Same as FR-1 but with `parent_id` set. Parent must exist (FK enforced by database). Event summary includes "delegate" designation.

**Validation:** Register parent, register delegate with --parent, verify parent_id set.

### FR-3: Agent deregistration

Update agent status to `completed`. Release claimed work items. Emit event. All in one transaction.

**Validation:** Register agent, claim a work item, deregister, verify status is `completed` and work item is `available`.

## Non-Functional Requirements

- **Atomicity:** Register and deregister are single transactions
- **Idempotency:** Deregistering an already-completed agent is a no-op (not an error)
- **Performance:** Registration under 10ms

## Key Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| Agent | A registered session | session_id, agent_name, pid, status |
| Event | Audit trail | event_type: agent_registered / agent_deregistered |

## Success Criteria

- [ ] Register creates agent row with correct fields
- [ ] Register emits agent_registered event
- [ ] Delegate registration links to parent via FK
- [ ] Deregister sets status to completed
- [ ] Deregister releases claimed work items
- [ ] Deregister emits agent_deregistered event
- [ ] Both commands support --json output

## Out of Scope

- Session hint / stable ID generation (future)
- Auto-registration via hooks (F-4 handles heartbeat hooks)
- Stale agent cleanup (F-6)
