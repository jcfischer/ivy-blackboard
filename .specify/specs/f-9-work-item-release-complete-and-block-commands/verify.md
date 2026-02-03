---
feature: "Work item release, complete, and block commands"
verified: true
---

# Verification: Work Item Release, Complete, and Block Commands

## Test Results

```
bun test v1.3.8
 54 pass / 0 fail in tests/work.test.ts
 183 pass / 0 fail total (full regression)
```

## CLI Verification

### Release lifecycle
```json
// Claim then release
{"ok":true,"item_id":"task-1","released":true,"previous_status":"claimed"}

// Re-claim succeeds after release
{"ok":true,"item_id":"task-1","claimed":true}
```

### Complete lifecycle
```json
{"ok":true,"item_id":"task-1","completed":true,"completed_at":"2026-02-03T21:37:43.832Z","claimed_by":"64190d1b-92d5-4c62-90f0-eff2a786d67a"}
```

### Block/Unblock lifecycle
```json
// Block with dependency
{"ok":true,"item_id":"task-2","blocked":true,"blocked_by":"task-1","previous_status":"available"}

// Unblock restores to available
{"ok":true,"item_id":"task-2","unblocked":true,"restored_status":"available"}
```

## Error Handling Verified

| Error Code | Trigger | Tested |
|-----------|---------|--------|
| WORK_ITEM_NOT_FOUND | Release/complete non-existent item | Yes |
| AGENT_NOT_FOUND | Release/complete with bad session | Yes |
| NOT_CLAIMED | Release/complete unclaimed item | Yes |
| NOT_CLAIMED_BY_SESSION | Release/complete wrong session | Yes |
| ALREADY_COMPLETED | Block/complete completed item | Yes |
| NOT_BLOCKED | Unblock non-blocked item | Yes |

## Coverage

- 20 new F-9 tests (6 release, 4 complete, 4 block, 3 unblock, 3 CLI E2E)
- All error paths tested with correct error codes
- Block retains claimed_by, unblock restores correct status
