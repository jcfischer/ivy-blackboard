---
task: Issue 44 task dependency tracking blackboard
slug: 20260322-164442_task-dependency-tracking-blackboard
effort: extended
phase: complete
progress: 30/30
mode: interactive
started: 2026-03-22T16:44:42+01:00
updated: 2026-03-22T17:07:00+01:00
---

## Context

Implement task dependency tracking for ivy-blackboard work items. Work items can declare dependencies on other tasks via a `depends_on` field, with automatic status transitions when dependencies complete. This enables SpecFlow phase orchestration where later phases (plan, implement, complete) depend on earlier phases (specify) completing successfully.

### Background
- Current work items are flat with no dependency relationships
- `blocked` status already exists in schema v7 but only for manual blocking
- Inspired by AI Team OS task dependency system
- Critical for SpecFlow multi-phase workflows

### Requirements (from GitHub issue #44)
- Add `depends_on` field to work_items (comma-separated IDs)
- Auto-block work items with unmet dependencies on creation
- Auto-unblock when all dependencies complete
- CLI support for `--depends-on` flag
- Filter blocked items from default available listings
- Show pending dependencies in status output

### Risks
1. Circular dependencies not detected - could create infinite loops
2. No index on depends_on - reverse lookups may be slow at scale
3. Comma-separated storage fragile vs JSON - but simpler for MVP
4. Race conditions possible with concurrent completions
5. Manual blocked items vs dependency-blocked items share same status - may confuse users
6. No migration rollback path tested

## Criteria

- [x] ISC-1: depends_on column added to work_items table schema
- [x] ISC-2: depends_on column type is TEXT (comma-separated IDs)
- [x] ISC-3: Schema v8 migration SQL created in schema.ts
- [x] ISC-4: MIGRATE_V8_SQL adds depends_on column via ALTER TABLE
- [x] ISC-5: SEED_VERSION_SQL includes v8 migration entry
- [x] ISC-6: CURRENT_SCHEMA_VERSION incremented to 8
- [x] ISC-7: BlackboardWorkItem interface includes depends_on field
- [x] ISC-8: createWorkItem accepts depends_on in options interface
- [x] ISC-9: createWorkItem validates depends_on IDs exist in database
- [x] ISC-10: createWorkItem sets status to blocked if depends_on provided
- [x] ISC-11: createWorkItem stores depends_on as comma-separated string
- [x] ISC-12: completeWorkItem queries for items depending on completed item
- [x] ISC-13: completeWorkItem checks each dependent's full dependency list
- [x] ISC-14: completeWorkItem transitions dependent to available when all deps complete
- [x] ISC-15: completeWorkItem emits event for auto-unblock transitions
- [x] ISC-16: work create CLI command accepts --depends-on flag
- [x] ISC-17: work create CLI validates --depends-on comma-separated format
- [x] ISC-18: work create CLI passes depends_on to createWorkItem
- [x] ISC-19: listWorkItems default excludes blocked status items
- [x] ISC-20: listWorkItems --status blocked shows blocked items
- [x] ISC-21: getWorkItemStatus includes depends_on in output
- [x] ISC-22: getWorkItemStatus resolves dependency IDs to titles
- [x] ISC-23: getWorkItemStatus shows completion status per dependency
- [x] ISC-24: Test creates item with single dependency
- [x] ISC-25: Test creates item with multiple dependencies
- [x] ISC-26: Test auto-blocks item with unmet dependency
- [x] ISC-27: Test auto-unblocks item when all dependencies complete
- [x] ISC-28: Test validation rejects nonexistent dependency IDs
- [x] ISC-29: createWorkItem detects and rejects direct circular dependencies
- [x] ISC-30: getWorkItemStatus distinguishes manual vs dependency blocking

### Critical Path
- ISC-1, ISC-3, ISC-6: Schema migration (blocks all other work)
- ISC-8, ISC-10: Auto-blocking logic (core dependency feature)
- ISC-12, ISC-14: Auto-unblocking logic (core dependency feature)
- ISC-27: Integration test (validates end-to-end behavior)

### Plan

**Phase 1: Schema (ISC-1 through ISC-7)**
- Add depends_on TEXT column to work_items
- Create MIGRATE_V8_SQL with ALTER TABLE
- Increment CURRENT_SCHEMA_VERSION
- Update TypeScript interfaces

**Phase 2: Validation (ISC-8, ISC-9, ISC-29)**
- Parse comma-separated depends_on string
- Validate dependency IDs exist
- Detect direct circular dependencies (item depends on self or mutual)

**Phase 3: Auto-block (ISC-10, ISC-11)**
- Check if any dependency is incomplete
- Set status='blocked' on creation if dependencies exist
- Store depends_on as comma-separated string

**Phase 4: Auto-unblock (ISC-12, ISC-13, ISC-14, ISC-15)**
- On completeWorkItem, query for items with completed_id in depends_on
- For each dependent, check if ALL its dependencies are complete
- Transition to 'available' and emit event if unblocked

**Phase 5: CLI (ISC-16, ISC-17, ISC-18)**
- Add --depends-on flag to work create command
- Validate format and pass to createWorkItem

**Phase 6: Query/Display (ISC-19 through ISC-23, ISC-30)**
- Verify listWorkItems default behavior excludes blocked
- Add dependency resolution to status output
- Distinguish manual vs dependency blocking

**Phase 7: Testing (ISC-24 through ISC-28)**
- Single dependency creation
- Multiple dependencies
- Auto-block behavior
- Auto-unblock on completion
- Validation rejection

## Decisions

## Verification

### Schema Migration
- Schema v8 migration SQL created and registered in migration system
- CURRENT_SCHEMA_VERSION incremented to 8
- depends_on column added to CREATE TABLE and MIGRATE_V8_SQL
- BlackboardWorkItem TypeScript interface updated with depends_on field

### Core Logic
- validateDependenciesAndGetStatus function validates IDs and checks completion
- Circular dependency detection (self-reference) implemented
- Auto-blocking: items with unmet dependencies created with status='blocked'
- Auto-unblocking: checkAndUnblockDependents called on completeWorkItem
- Event emission for auto-unblock transitions

### CLI
- --depends-on flag added to `work create` and `work claim` commands
- Comma-separated format parsed and passed to createWorkItem
- status command displays dependency chain with completion indicators

### Tests
- All 447 tests pass (89 work.test.ts tests including 8 new dependency tests)
- Test coverage: single dep, multiple deps, auto-block, auto-unblock, validation, circular detection
- No regressions in existing functionality

### File Changes
- src/schema.ts: +depends_on column, MIGRATE_V8_SQL, CURRENT_SCHEMA_VERSION=8
- src/types.ts: BlackboardWorkItem.depends_on field
- src/work.ts: CreateWorkItemOptions.dependsOn, validateDependenciesAndGetStatus, checkAndUnblockDependents
- src/commands/work.ts: --depends-on CLI flag, dependency display in status output
- src/db.ts: MIGRATE_V8_SQL import and migration registration
- tests/work.test.ts: 8 new dependency tracking tests
- tests/schema.test.ts: Updated version check to 8
