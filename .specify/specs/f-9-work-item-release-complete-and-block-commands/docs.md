---
feature: "Work item release, complete, and block commands"
---

# Work Item Release, Complete, and Block Commands

## Overview

Four work item lifecycle operations that complete the work item state machine: release (return to pool), complete (mark done), block (mark dependency), and unblock (restore previous state).

## API

### releaseWorkItem(db, itemId, sessionId)

Returns a claimed work item to `available` status.

- Clears `claimed_by` and `claimed_at`
- Emits `work_released` event
- Validates: item exists, session exists, item is claimed, claimed by this session

### completeWorkItem(db, itemId, sessionId)

Marks a claimed work item as `completed`.

- Sets `completed_at`, retains `claimed_by` for audit history
- Emits `work_completed` event
- Same validations as release

### blockWorkItem(db, itemId, opts?)

Marks a work item as `blocked`.

- Optional `opts.blockedBy` records the blocking dependency
- Retains `claimed_by` if item was claimed
- Emits `work_blocked` event
- Cannot block completed items

### unblockWorkItem(db, itemId)

Restores a blocked work item to its previous state.

- If `claimed_by` is set, restores to `claimed`; otherwise `available`
- Clears `blocked_by`
- Emits `work_released` event

## CLI Commands

```bash
blackboard work release --id <id> --session <session> [--json]
blackboard work complete --id <id> --session <session> [--json]
blackboard work block --id <id> [--blocked-by <item-id>] [--json]
blackboard work unblock --id <id> [--json]
```

## Error Codes

| Code | Condition |
|------|-----------|
| WORK_ITEM_NOT_FOUND | Item ID not in database |
| AGENT_NOT_FOUND | Session ID not in database |
| NOT_CLAIMED | Item not in claimed status |
| NOT_CLAIMED_BY_SESSION | Item claimed by different agent |
| ALREADY_COMPLETED | Item already completed |
| NOT_BLOCKED | Item not in blocked status |

## State Machine

```
available ──claim──> claimed ──complete──> completed
    ^                  │  ^                    (terminal)
    │                  │  │
    └──release─────────┘  └──unblock──── blocked
    │                                       ^
    └──unblock (no claimer)─────────────────┘

Any non-completed ──block──> blocked
```
