---
task: age-aware task scoring to prevent starvation
slug: 20260322-164448_age-aware-task-scoring
effort: standard
phase: complete
progress: 18/18
mode: interactive
started: 2026-03-22T16:44:48Z
updated: 2026-03-22T16:47:30Z
---

## Context

Implementing age-aware task scoring for ivy-blackboard work items to prevent indefinite starvation of lower-priority tasks. Current system uses flat P1/P2/P3 priority ordering. When new P1 tasks continually arrive, P2 and P3 tasks can sit in `available` status forever with no mechanism to surface them.

Solution inspired by AI Team OS ([CronusL-1141/AI-company](https://github.com/CronusL-1141/AI-company)) task scoring formula. We add an `effective_priority` calculation that boosts score based on age:

```
effective_score = base_priority_weight + min(age_days * boost_rate, max_boost)
```

Where:
- `base_priority_weight`: P1=100, P2=40, P3=10
- `boost_rate`: 5 points per day (configurable)
- `max_boost`: 50 (capped at 50% of P1 weight to prevent priority inversion)
- `age_days`: days since work item creation

The `created_at` timestamp already exists in the schema (added in v1). We modify `listWorkItems()` to calculate effective scores and order by them. Add optional `--show-scores` flag to the CLI for debugging.

### Risks

- Priority inversion if max_boost is too high (P3 outranks fresh P1)
- Performance impact of calculating age in query (mitigated by existing created_at index)
- Configuration complexity if boost rates differ per priority tier (out of scope for v1)
- Config schema validation could reject invalid boost rates silently
- Dashboard SQL query not updated, showing different order than CLI
- Existing tests hardcode expected order and break with new scoring

## Criteria

- [x] ISC-1: Base priority weights defined as constants (P1=100, P2=40, P3=10)
- [x] ISC-2: Boost rate configurable via config (default 5 points/day)
- [x] ISC-3: Max boost configurable via config (default 50 points)
- [x] ISC-4: `listWorkItems()` calculates age_days from created_at to now
- [x] ISC-5: `listWorkItems()` calculates effective_score using formula
- [x] ISC-6: `listWorkItems()` orders by effective_score DESC, created_at ASC
- [x] ISC-7: Effective score capped so P3+max cannot exceed fresh P1
- [x] ISC-8: CLI `work list` displays items using new scoring order
- [x] ISC-9: CLI `work list --show-scores` flag displays effective scores
- [x] ISC-10: Config file supports `scoring.boostRate` field
- [x] ISC-11: Config file supports `scoring.maxBoost` field
- [x] ISC-12: Test: P1 item at day 0 ranks higher than P3 at day 20
- [x] ISC-13: Test: P2 item at day 15 ranks higher than P2 at day 0
- [x] ISC-14: Test: P3 item at max boost still ranks below fresh P1
- [x] ISC-15: Test: Items with same effective score ordered by created_at ASC
- [x] ISC-16: README documents scoring formula and configuration options
- [x] ISC-17: CHANGELOG entry added for age-aware scoring feature
- [x] ISC-18: No existing work list queries broken by scoring change

## Decisions

## Verification

**ISC-1 through ISC-11: Code changes verified**
- ✅ Config schema at src/config.ts:54-67 defines priorityWeights (P1=100, P2=40, P3=10), boostRatePerDay (5), maxBoost (50)
- ✅ listWorkItems() at src/work.ts:677-698 calculates age_days using julianday(), applies boost formula, orders by effective_score DESC
- ✅ CLI at src/commands/work.ts:223 adds --show-scores flag, displays effective_score column when enabled

**ISC-12 through ISC-15: Test coverage verified**
- ✅ All 86 tests pass including new age-aware scoring tests
- ✅ P1 day 0 > P3 day 20 (test at line 1265)
- ✅ P2 day 15 > P2 day 0 (test at line 1277)
- ✅ P3 max boost < fresh P1 (test at line 1289)
- ✅ Same score orders by created_at ASC (test at line 1301)
- ✅ --show-scores displays effective_score field (test at line 1311)

**ISC-16 through ISC-17: Documentation verified**
- ✅ README.md:158-185 documents scoring formula, configuration, and usage
- ✅ CHANGELOG.md:11-16 has entry for age-aware task scoring (#43)

**ISC-18: Backward compatibility verified**
- ✅ CLI smoke test passed: work list displays scores correctly
- ✅ Existing work items from live database (review-ragen, review-ivy-h) show proper effective scores (100.1, 100.0)
- ✅ No schema migration needed (created_at field already exists)
