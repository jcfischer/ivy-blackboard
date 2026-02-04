---
id: "F-8"
feature: "Work item create and claim commands"
status: "draft"
created: "2026-02-03"
---

# Specification: Work Item Create and Claim Commands

## Overview

Implement `blackboard work claim` for creating and/or claiming work items. A claim atomically sets status to 'claimed' with the agent's session_id. When --title is provided, a new work item is created and immediately claimed in one transaction. Supports sources (github, local, operator), priorities (P1/P2/P3), and project association.

## User Scenarios

### Scenario 1: Create and claim a new work item

**As a** PAI agent starting work on a task
**I want to** create a work item and claim it atomically
**So that** other agents know I'm working on it

**Acceptance Criteria:**
- [ ] `blackboard work claim --id "task-1" --title "Implement schema" --session <id>` creates and claims
- [ ] Work item gets status 'claimed', claimed_by set to session_id, claimed_at set to now
- [ ] Emits `work_created` and `work_claimed` events
- [ ] --source defaults to 'local', --priority defaults to 'P2'
- [ ] JSON output follows `{ ok, ... }` envelope

### Scenario 2: Claim an existing available work item

**As a** PAI agent picking up available work
**I want to** claim an existing work item
**So that** no other agent claims the same item

**Acceptance Criteria:**
- [ ] `blackboard work claim --id "task-1" --session <id>` claims existing available item
- [ ] Atomic: UPDATE WHERE status='available' ensures no double-claim
- [ ] Returns 0-change result if another agent already claimed it (no error, just conflict)
- [ ] Emits `work_claimed` event

### Scenario 3: Create without claiming

**As a** PAI operator creating work for agents to pick up
**I want to** create a work item without claiming it
**So that** agents can claim it later

**Acceptance Criteria:**
- [ ] `blackboard work claim --id "task-1" --title "New task"` (no --session) creates as 'available'
- [ ] Work item has status 'available', claimed_by null
- [ ] Emits only `work_created` event

### Scenario 4: Work item with full details

**As a** PAI agent creating detailed work items
**I want to** specify project, source, priority, and description
**So that** work items have complete context

**Acceptance Criteria:**
- [ ] --project associates with registered project
- [ ] --source validates against github, local, operator
- [ ] --source-ref stores external reference (e.g., issue URL)
- [ ] --priority validates against P1, P2, P3
- [ ] --description stores detailed description
- [ ] Invalid source/priority values produce clear errors

## Functional Requirements

### FR-1: Create work item

Insert into work_items table with generated created_at. Validate source against WORK_ITEM_SOURCES and priority against WORK_ITEM_PRIORITIES. Emit `work_created` event.

**Validation:** Create item, query table, verify all fields stored correctly.

### FR-2: Atomic claim

UPDATE work_items SET status='claimed', claimed_by=?, claimed_at=? WHERE item_id=? AND status='available'. Check changes count — 0 means already claimed (conflict), 1 means success. Emit `work_claimed` event on success.

**Validation:** Two agents try to claim same item, only one succeeds.

### FR-3: Create-and-claim transaction

Both INSERT and UPDATE in one transaction. If session is provided with title, item is created then claimed atomically.

**Validation:** Create-and-claim, verify status is 'claimed' and both events emitted.

### FR-4: Duplicate item detection

Primary key constraint on item_id catches duplicates. Produce friendly error.

**Validation:** Create same item_id twice, verify error mentions the ID.

### FR-5: Error handling

| Scenario | Response |
|----------|----------|
| Invalid source value | BlackboardError with valid values listed |
| Invalid priority value | BlackboardError with valid values listed |
| Non-existent session_id for claim | BlackboardError "Agent session not found" |
| Non-existent item_id for claim (no --title) | BlackboardError "Work item not found" |
| Duplicate item_id | BlackboardError "Work item already exists: {id}" |
| Claim conflict (already claimed) | Success with claimed=false, no error |

## Non-Functional Requirements

- **Atomicity:** Create-and-claim is a single transaction
- **Conflict safety:** Claim uses WHERE status='available' for race-free atomics

## Key Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| WorkItem | Task unit | item_id, title, status, claimed_by, priority |
| Event | Audit trail | work_created, work_claimed |

## Success Criteria

- [ ] Create work item with all field types
- [ ] Claim existing available item atomically
- [ ] Create-and-claim in one transaction
- [ ] Conflict returns 0 changes (no error)
- [ ] Validates source and priority values
- [ ] Duplicate item_id produces clear error
- [ ] Both commands support --json output

## Out of Scope

- Work item release/complete/block (F-9)
- Work item listing (F-10)
- Priority-based auto-assignment
