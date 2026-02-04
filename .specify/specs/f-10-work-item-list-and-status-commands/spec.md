---
id: "F-10"
feature: "Work item list and status commands"
status: "draft"
created: "2026-02-03"
---

# Specification: Work Item List and Status Commands

## Overview

Implement `blackboard work list` and `blackboard work status <id>`. List shows work items with filtering by project, status, and priority. Status shows detailed single-item view including claim history from events. Both support --json output.

## User Scenarios

### Scenario 1: List available work items

**As a** PAI agent looking for work
**I want to** see available work items
**So that** I can claim one to work on

**Acceptance Criteria:**
- [ ] `blackboard work list` shows items with status 'available' by default
- [ ] Table columns: ID, TITLE, PROJECT, STATUS, PRIORITY, CLAIMED BY, CREATED
- [ ] Ordered by priority (P1 first), then created_at DESC
- [ ] "No work items." message when empty

### Scenario 2: Filter work items

**As a** PAI agent looking for specific work
**I want to** filter by project, status, or priority
**So that** I can find relevant items quickly

**Acceptance Criteria:**
- [ ] --project filters by project_id
- [ ] --status filters by status (comma-separated: "available,claimed")
- [ ] --priority filters by priority (comma-separated: "P1,P2")
- [ ] --all shows all statuses including completed and blocked
- [ ] Filters can be combined

### Scenario 3: View work item details

**As a** PAI agent investigating a work item
**I want to** see full details and claim history
**So that** I understand its context and lifecycle

**Acceptance Criteria:**
- [ ] `blackboard work status <id>` shows all fields
- [ ] Shows claim history from events table (created, claimed, released, completed)
- [ ] Shows relative timestamps for created_at, claimed_at
- [ ] Non-existent item produces clear error

### Scenario 4: JSON output

**As a** PAI agent querying programmatically
**I want to** get structured data
**So that** I can parse and act on it

**Acceptance Criteria:**
- [ ] `work list --json` follows `{ ok, count, items, timestamp }` envelope
- [ ] `work status <id> --json` follows `{ ok, ..., history, timestamp }` envelope

## Functional Requirements

### FR-1: Default work item listing

Query work_items for status='available'. Order by priority ASC (P1 first), then created_at DESC. Format as ASCII table.

**Validation:** Create items with various priorities, list, verify ordering.

### FR-2: Filtered listing

Parse --status as comma-separated, validate against WORK_ITEM_STATUSES. Parse --priority as comma-separated, validate against WORK_ITEM_PRIORITIES. --project filters by project_id. --all overrides default status filter.

| Invalid Input | Response |
|---------------|----------|
| Invalid status value (e.g., "bogus") | BlackboardError with valid values listed |
| Invalid priority value (e.g., "P9") | BlackboardError with valid values listed |
| Non-existent project filter | Empty result (not an error) |

**Validation:** Create items across projects/statuses, filter, verify correct results. Verify invalid filter values throw.

### FR-3: Work item status detail

Query single item by item_id. Query events WHERE target_id=item_id AND target_type='work_item' ORDER BY timestamp. Display all fields plus event history.

**Validation:** Claim then release an item, verify status shows full history.

## Non-Functional Requirements

- **Performance:** List query under 10ms for typical counts (<1000)
- **Ordering:** Priority-first, then recency

## Key Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| WorkItem | Item to display | All work_item fields |
| Event | Claim history | work_created, work_claimed, work_released, work_completed |

## Success Criteria

- [ ] Default list shows available items ordered by priority
- [ ] --all shows all statuses
- [ ] --status, --project, --priority filters work correctly
- [ ] Status command shows full item detail with history
- [ ] Non-existent item produces clear error
- [ ] Both commands support --json output
- [ ] Empty result shows appropriate message

## Out of Scope

- Work item creation/claiming (F-8)
- Work item state transitions (F-9)
- Agent-specific work item views
