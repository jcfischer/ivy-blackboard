---
feature: "File permissions enforcement"
plan: "./plan.md"
status: "pending"
total_tasks: 4
completed: 0
---

# Tasks: File Permissions Enforcement

## Legend

- `[T]` - Test required (TDD mandatory - write test FIRST)
- `[P]` - Can run in parallel with other [P] tasks in same group
- `depends: T-X.Y` - Must complete after specified task(s)

## Task Groups

### Group 1: Permission utilities

- [ ] **T-1.1** Implement setSecurePermissions [T]
  - File: `src/permissions.ts`
  - Test: `tests/permissions.test.ts`
  - Description: `setSecurePermissions(dbPath: string): void` — chmod 0600 on .db file, .db-wal (if exists), .db-shm (if exists). chmod 0700 on containing directory. Handle missing WAL/SHM files gracefully (they're created by SQLite on first write). Log warning if chmod fails (non-fatal).

- [ ] **T-1.2** Implement validatePermissions [T] (depends: T-1.1)
  - File: `src/permissions.ts`
  - Test: `tests/permissions.test.ts`
  - Description: `validatePermissions(dbPath: string): void` — stat the file, extract mode bits. World-readable (mode & 0o004): throw error with fix command (`chmod 600 <path>`). Group-readable (mode & 0o040): console.warn with suggestion. Owner-only: silent pass. Skip entirely if platform is not POSIX (win32).

### Group 2: Integration

- [ ] **T-2.1** Integrate with openDatabase [T] (depends: T-1.2)
  - File: `src/db.ts` (modify)
  - Test: `tests/db.test.ts` (add cases)
  - Description: In `openDatabase()`: if database file exists, call `validatePermissions()` before opening. After creating a new database, call `setSecurePermissions()`. Catch permission errors and wrap with context.

- [ ] **T-2.2** Platform detection [T] [P]
  - File: `src/permissions.ts`
  - Test: `tests/permissions.test.ts`
  - Description: Add `isPosixPlatform(): boolean` check using `process.platform !== 'win32'`. Both `setSecurePermissions` and `validatePermissions` are no-ops on non-POSIX platforms. Log debug message when skipping.

## Dependency Graph

```
T-1.1 ──> T-1.2 ──> T-2.1
T-2.2 (independent, can run anytime)
```

## Execution Order

1. **T-1.1** setSecurePermissions
2. **T-1.2** validatePermissions (after T-1.1)
3. **Parallel:** T-2.1, T-2.2

## Progress Tracking

| Task | Status | Started | Completed | Notes |
|------|--------|---------|-----------|-------|
| T-1.1 | pending | - | - | |
| T-1.2 | pending | - | - | |
| T-2.1 | pending | - | - | |
| T-2.2 | pending | - | - | |

## TDD Enforcement (MANDATORY)

**CRITICAL:** Every task marked [T] MUST follow the RED-GREEN-BLUE cycle.

### Test Notes

Tests create temp directories with known permissions, run the functions, then verify with `fs.statSync().mode`. Test cleanup removes temp files. On CI, tests may need to skip if running as root (root ignores permission checks).

## Blockers & Issues

| Task | Issue | Resolution |
|------|-------|------------|
| - | - | - |

## Post-Implementation Verification

### Functional Verification
- [ ] New database files are 0600
- [ ] New database directories are 0700
- [ ] World-readable database is refused with clear error
- [ ] Group-readable database warns but opens

### Failure Verification (Doctorow Gate)
- [ ] **Failure test:** chmod fails on read-only filesystem — warning logged, no crash
- [ ] **Failure test:** stat fails (file deleted race) — warning logged, no crash
- [ ] **Rollback test:** Removing permissions.ts — db.ts still works (just no permission checks)

### Maintainability Verification
- [ ] Mode bit constants are named, not magic numbers
- [ ] Error messages include actual path and current permissions

### Sign-off
- [ ] All verification items checked
- Date completed: ___
