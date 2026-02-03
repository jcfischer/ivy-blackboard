---
id: "F-4"
feature: "Agent heartbeat command"
status: "draft"
created: "2026-02-03"
---

# Specification: Agent Heartbeat Command

## Overview

Implement the `blackboard agent heartbeat` command. A heartbeat updates the agent's `last_seen_at` timestamp and inserts a row in the `heartbeats` table with optional progress text and work_item_id. If progress is provided, an event is also emitted. This keeps agents visible on the blackboard and provides a progress trail.

## User Scenarios

### Scenario 1: Basic heartbeat (keep-alive)

**As a** PAI agent running a long task
**I want to** send periodic heartbeats
**So that** the blackboard knows I'm still alive (not stale)

**Acceptance Criteria:**
- [ ] `blackboard agent heartbeat --session <id>` updates last_seen_at on the agent
- [ ] Inserts a row in heartbeats table with session_id and timestamp
- [ ] Human output shows session name and new last_seen_at
- [ ] JSON output follows `{ ok, ... }` envelope

### Scenario 2: Heartbeat with progress

**As a** PAI agent making progress on a task
**I want to** include a progress note with my heartbeat
**So that** other agents can see what I've accomplished

**Acceptance Criteria:**
- [ ] `--progress "Completed schema section"` stores progress text in heartbeats row
- [ ] Emits `heartbeat` event with progress in summary (only when progress provided)
- [ ] No event emitted for progress-less heartbeats (avoid spam)

### Scenario 3: Heartbeat with work item reference

**As a** PAI agent working on a specific work item
**I want to** link my heartbeat to the work item
**So that** progress is tracked per work item

**Acceptance Criteria:**
- [ ] `--work-item <id>` stores work_item_id in heartbeats row
- [ ] Work item must exist (FK enforced)
- [ ] Updates agent's current_work field if progress is provided

### Scenario 4: Heartbeat for non-existent session

**As a** user sending a heartbeat for a session that doesn't exist
**I want to** get a clear error
**So that** I know the session needs to be registered first

**Acceptance Criteria:**
- [ ] Error message includes the session_id that wasn't found
- [ ] Exit code is non-zero
- [ ] JSON output: `{ ok: false, error: "..." }`

## Functional Requirements

### FR-1: Heartbeat recording

Atomically in one transaction: update agent's last_seen_at, insert heartbeats row, optionally emit event (only if progress provided).

**Validation:** Send heartbeat, query heartbeats table and agents table, verify both updated.

### FR-2: Agent validation

Heartbeat must target an existing agent session. Non-existent session_id produces a clear error.

**Validation:** Send heartbeat for nonexistent session, verify error with session_id in message.

### FR-3: Progress tracking

When progress is provided, update agent's `current_work` field and emit a `heartbeat` event with the progress text in the summary.

**Validation:** Send heartbeat with progress, verify agent.current_work updated and event emitted.

## Non-Functional Requirements

- **Atomicity:** Heartbeat is a single transaction
- **Performance:** Under 5ms per heartbeat
- **Spam avoidance:** No event emitted for progress-less heartbeats

## Key Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| Heartbeat | A timestamped keep-alive record | session_id, timestamp, progress |
| Agent | Updated last_seen_at | session_id, last_seen_at, current_work |
| Event | Audit (only with progress) | event_type: heartbeat |

## Success Criteria

- [ ] Heartbeat updates agent last_seen_at
- [ ] Heartbeat inserts row in heartbeats table
- [ ] Progress text stored in heartbeat and agent.current_work
- [ ] Event emitted only when progress provided
- [ ] Error on non-existent session
- [ ] Supports --json output

## Out of Scope

- Automatic heartbeat via hooks (integration point, not this feature)
- Stale detection based on heartbeat timing (F-6)
- Heartbeat interval configuration (handled by F-20 config)
