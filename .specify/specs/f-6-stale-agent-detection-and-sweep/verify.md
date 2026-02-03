---
feature: "Stale agent detection and sweep"
verified: true
---

# Verification: Stale Agent Detection and Sweep

## Test Results

```
bun test v1.3.8
 18 pass / 0 fail in tests/sweep.test.ts
 201 pass / 0 fail total (full regression)
```

## isPidAlive Verification

- null pid → false
- process.pid → true
- non-existent PID (4294967) → false

## sweepStaleAgents Verification

- Dead agent (pid=null, old last_seen_at) → marked stale
- Claimed items released (status=available, claimed_by=NULL)
- agent_stale event emitted
- stale_locks_released event emitted when items released
- Alive agent (process.pid) → last_seen_at refreshed, added to pidsVerified
- Old heartbeats pruned
- No candidates → empty result
- Fresh agents not swept
- Completed/already-stale agents skipped

## Auto-sweep Verification

- createContext sweeps stale agents silently
- Sweep errors don't prevent command execution (fail-open)
- Sweep command opts out of auto-sweep via disableAutoSweep

## CLI Verification

- `blackboard sweep --json` → returns SweepResult with staleAgents array
- `blackboard sweep --dry-run --json` → returns candidates without modifying DB
- `blackboard sweep --threshold 5` → uses custom threshold
- `blackboard sweep` (no stale) → "No stale agents detected."
