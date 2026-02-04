---
id: "F-12"
feature: "Observe command — event log with cursor"
status: "draft"
created: "2026-02-03"
---

# Specification: Observe Command — Event Log with Cursor

## Overview

Implement the `blackboard observe` command to read from the events table with filtering and cursor support. Displays a human-readable timeline of blackboard events with filtering by time, event type, and actor. Supports JSON output for programmatic consumption.

## User Scenarios

### Scenario 1: View recent events

**As a** PAI operator monitoring blackboard activity
**I want to** see recent events in human-readable timeline format
**So that** I can understand what agents are doing

**Acceptance Criteria:**
- [ ] `blackboard observe` shows last 50 events by default
- [ ] Timeline format: timestamp, event type, actor, summary
- [ ] Most recent events last (chronological order)
- [ ] "No events." message when no events match

### Scenario 2: Filter by time duration

**As a** PAI operator investigating recent activity
**I want to** see events from the last N hours/minutes
**So that** I can focus on a specific time window

**Acceptance Criteria:**
- [ ] `--since 1h` shows events from last hour
- [ ] `--since 30m` shows events from last 30 minutes
- [ ] Supports: `Xs` (seconds), `Xm` (minutes), `Xh` (hours), `Xd` (days)
- [ ] Invalid duration format produces error

### Scenario 3: Filter by event type

**As a** PAI operator debugging work item issues
**I want to** see only work-related events
**So that** I can trace work item lifecycle

**Acceptance Criteria:**
- [ ] `--type work_claimed,work_completed` shows only those event types
- [ ] Comma-separated list of types
- [ ] Invalid event type produces error with valid options

### Scenario 4: Filter by actor (session)

**As a** PAI operator tracking a specific agent
**I want to** see only events from that agent
**So that** I can audit its actions

**Acceptance Criteria:**
- [ ] `--session <id>` filters events where actor_id matches
- [ ] Works with partial session ID match (first 12 chars)

### Scenario 5: JSON output

**As a** PAI agent querying event history programmatically
**I want to** get events as JSON
**So that** I can parse and analyze the data

**Acceptance Criteria:**
- [ ] `--json` output follows `{ ok, count, items, timestamp }` envelope
- [ ] Each item has all event fields (id, timestamp, event_type, actor_id, target_id, target_type, summary, metadata)

## Functional Requirements

### FR-1: Default event listing

Query events table ordered by timestamp ASC (oldest first, so newest appears last). Limit to 50 events by default. Format as timeline: each line shows timestamp, event type, actor (first 12 chars if present), and summary.

**Validation:** Create events, observe, verify chronological order and format.

### FR-2: --since duration filter

Parse duration string (e.g., "1h", "30m", "2d"). Convert to seconds. Query WHERE timestamp >= datetime('now', '-X seconds').

**Validation:** Create events at different times, filter, verify correct results.

### FR-3: --type filter

Parse comma-separated event types. Validate each against EVENT_TYPES from types.ts. Query WHERE event_type IN (...).

**Validation:** Create various event types, filter, verify correct results.

### FR-4: --session filter

Query WHERE actor_id LIKE '<session_prefix>%' OR actor_id = '<session_id>'. Allows partial or full session ID match.

**Validation:** Create events with different actors, filter, verify results.

### FR-5: --limit flag

Override default limit of 50 events. Query LIMIT <n>.

**Validation:** Create many events, use various limits, verify count.

## Non-Functional Requirements

- **Performance:** Query under 20ms for typical event counts (<1000 events in result)
- **Ordering:** Always chronological (oldest first)
- **Formatting:** Timestamps in relative format ("2 min ago") or absolute ISO depending on age

## Key Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| Event | Blackboard event record | id, timestamp, event_type, actor_id, target_id, target_type, summary, metadata |

## Success Criteria

- [ ] Default observe shows last 50 events chronologically
- [ ] --since parses durations and filters correctly
- [ ] --type validates and filters event types
- [ ] --session filters by actor ID (full or partial match)
- [ ] --limit controls result count
- [ ] Timeline format is readable and informative
- [ ] JSON output follows envelope format
- [ ] Empty result shows appropriate message

## Out of Scope

- Cursor-based pagination (future: store last seen event ID)
- Event streaming (watch mode)
- Event aggregation or statistics
- Filtering by target_id or target_type (can be added later)
