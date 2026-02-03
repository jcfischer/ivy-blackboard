---
feature: "Work item release, complete, and block commands"
feature_id: "F-9"
status: "approved"
priority: 5
depends_on: ["F-8"]
---

# Specification: Work Item Release, Complete, and Block Commands

## Problem

Agents can create and claim work items (F-8), but there's no way to transition them out of the "claimed" state. An agent that finishes work, decides to hand off, or discovers a dependency has no mechanism to mark the item accordingly. Work items get stuck in "claimed" forever, making the work lifecycle incomplete.

## Users

- **Claude Code agents** that complete tasks and need to record completion
- **Delegate agents** that may need to release work if their parent takes over
- **The sweep system** (F-6) that needs to release work from stale agents
- **Operators** who may block or unblock items via CLI

## Functional Requirements

### FR-1: releaseWorkItem(db, itemId, sessionId)

Release a claimed work item back to "available" status.

- Validates item exists (throw `WORK_ITEM_NOT_FOUND` if not)
- Validates session exists (throw `AGENT_NOT_FOUND` if not)
- Verifies the item is currently claimed by the given session (throw `NOT_CLAIMED_BY_SESSION` if claimed by another agent, throw `NOT_CLAIMED` if item is not in "claimed" status)
- Atomically sets status='available', claimed_by=NULL, claimed_at=NULL
- Emits `work_released` event with actor_id=sessionId
- Returns `{ item_id, released: true, previous_status: 'claimed' }`

### FR-2: completeWorkItem(db, itemId, sessionId)

Mark a claimed work item as completed.

- Validates item exists (throw `WORK_ITEM_NOT_FOUND` if not)
- Validates session exists (throw `AGENT_NOT_FOUND` if not)
- Verifies the item is currently claimed by the given session (same errors as FR-1)
- Sets status='completed', completed_at=now (retains claimed_by for history)
- Emits `work_completed` event with actor_id=sessionId
- Returns `{ item_id, completed: true, completed_at, claimed_by }`

### FR-3: blockWorkItem(db, itemId, opts)

Mark a work item as blocked.

- Validates item exists (throw `WORK_ITEM_NOT_FOUND` if not)
- Item can be blocked from any non-completed status (available or claimed)
- Sets status='blocked', blocked_by=opts.blockedBy (optional item_id of blocking item)
- If item was claimed, retains claimed_by (the agent is still responsible, just blocked)
- Emits `work_blocked` event
- Returns `{ item_id, blocked: true, blocked_by, previous_status }`

### FR-4: unblockWorkItem(db, itemId)

Unblock a blocked work item, restoring its previous status.

- Validates item exists (throw `WORK_ITEM_NOT_FOUND` if not)
- Validates item is currently blocked (throw `NOT_BLOCKED` if not)
- If claimed_by is set, restores status='claimed'; otherwise status='available'
- Clears blocked_by
- Emits event (uses `work_released` event type since there's no `work_unblocked` in the schema)
- Returns `{ item_id, unblocked: true, restored_status }`

### FR-5: CLI Commands

**work release:**
```bash
blackboard work release --id <id> --session <session>
```
Human-readable: "Released work item: {id}\nStatus: available (was claimed by {agent} for {duration})"
JSON: formatJson(result)

**work complete:**
```bash
blackboard work complete --id <id> --session <session>
```
Human-readable: "Completed work item: {id}\nDuration: {duration} (claimed by {agent})"
JSON: formatJson(result)

**work block:**
```bash
blackboard work block --id <id> [--blocked-by <item-id>]
```
No session required (operator or any agent can block).
Human-readable: "Blocked work item: {id}\nBlocked by: {blocker-id}"
JSON: formatJson(result)

**work unblock:**
```bash
blackboard work unblock --id <id>
```
Human-readable: "Unblocked work item: {id}\nRestored status: {status}"
JSON: formatJson(result)

## Error Handling

| Error | Code | When |
|-------|------|------|
| Item not found | `WORK_ITEM_NOT_FOUND` | Any operation on non-existent item_id |
| Session not found | `AGENT_NOT_FOUND` | release/complete with non-existent session |
| Not claimed by session | `NOT_CLAIMED_BY_SESSION` | release/complete when item is claimed by a different agent |
| Not in claimed status | `NOT_CLAIMED` | release/complete when item isn't claimed |
| Not in blocked status | `NOT_BLOCKED` | unblock when item isn't blocked |
| Already completed | `ALREADY_COMPLETED` | Any status change on a completed item |

## Non-Functional Requirements

- All operations are atomic (SQLite transactions)
- Events are emitted within the same transaction as the status change
- No new tables or schema changes required

## Success Criteria

- [ ] release returns item to available, clears claimed_by/claimed_at
- [ ] complete sets completed_at, retains claimed_by for history
- [ ] block works from available or claimed status
- [ ] unblock restores previous status based on claimed_by presence
- [ ] All error cases throw appropriate BlackboardError codes
- [ ] CLI commands produce correct human and JSON output
- [ ] All existing 163 tests continue to pass
