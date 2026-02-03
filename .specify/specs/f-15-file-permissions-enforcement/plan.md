---
feature: "File permissions enforcement"
spec: "./spec.md"
status: "draft"
---

# Technical Plan: File Permissions Enforcement

## Architecture Overview

A `permissions.ts` module that provides two functions: `setSecurePermissions(path)` called after database creation, and `validatePermissions(path)` called before database open. Integrated into F-1's `openDatabase()` flow.

```
openDatabase(path)
    |
    ├─ File exists?
    │   ├─ YES → validatePermissions(path)
    │   │         ├─ world-readable → ERROR (refuse to open)
    │   │         ├─ group-readable → WARN (continue)
    │   │         └─ owner-only → OK (continue)
    │   └─ NO → createDatabase() → setSecurePermissions(path)
    |
    v
Database handle
```

## Technology Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Language | TypeScript | PAI standard |
| Runtime | Bun | PAI standard |
| File ops | `node:fs` | chmod, stat — built-in |

## Constitutional Compliance

- [x] **CLI-First:** Permissions enforced transparently on every CLI invocation
- [x] **Library-First:** `permissions.ts` is a pure utility module
- [x] **Test-First:** Unit tests with temp directories for permission checks
- [x] **Deterministic:** Permission bits are fixed values
- [x] **Code Before Prompts:** No AI involvement in permission logic

## API Contracts

### Internal APIs

```typescript
// Set restrictive permissions on database files and directory
function setSecurePermissions(dbPath: string): void;

// Validate permissions before opening database
// Throws on world-readable, warns on group-readable
function validatePermissions(dbPath: string): void;

// Check if a specific file has acceptable permissions
function checkFileMode(filePath: string): { mode: number; ok: boolean; warning: boolean };
```

## Implementation Strategy

### Phase 1: Permission setting

- [ ] `setSecurePermissions()` — chmod 0600 on .db, .db-wal, .db-shm
- [ ] Directory chmod 0700
- [ ] Handle missing WAL/SHM files (may not exist yet)

### Phase 2: Permission validation

- [ ] `validatePermissions()` — stat file, check mode bits
- [ ] World-readable (o+r): throw with fix command
- [ ] Group-readable (g+r): console.warn, continue
- [ ] Owner-only: silent pass

### Phase 3: Integration with db.ts

- [ ] Call `setSecurePermissions()` after database creation in `openDatabase()`
- [ ] Call `validatePermissions()` before opening existing database
- [ ] Platform check: skip on Windows

## File Structure

```
src/
├── permissions.ts      # [New] Permission setting and validation

tests/
├── permissions.test.ts # [New] Permission checks with temp files
```

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| macOS vs Linux stat format differences | Low | Low | Use `fs.statSync().mode` which is portable |
| Bun chmod behavior differs from Node | Low | Low | Test in CI |
| Non-POSIX filesystem (FAT32, exFAT) ignores chmod | Low | Low | Log warning, don't fail |

## Failure Mode Analysis

| Failure Mode | Trigger | Detection | Degradation | Recovery |
|-------------|---------|-----------|-------------|----------|
| chmod fails | Read-only filesystem | Error from chmodSync | Log warning, continue | Permissions are defense-in-depth |
| stat fails | File deleted between check and open | Error from statSync | Log warning, continue | Race is benign |

### Blast Radius

- **Files touched:** ~1 new, ~1 modified (db.ts integration)
- **Systems affected:** F-1 database init
- **Rollback strategy:** Remove permission checks, database still works

## Dependencies

### External

- `node:fs` (Bun built-in) — chmodSync, statSync

### Internal

- F-1 `db.ts` — integration point for openDatabase()

## Estimated Complexity

- **New files:** ~1
- **Modified files:** ~1 (db.ts)
- **Test files:** ~1
- **Estimated tasks:** ~3
- **Debt score:** 1 (simple utility)

## Longevity Assessment

### Maintainability Indicators

| Indicator | Status | Notes |
|-----------|--------|-------|
| **Readability:** | Yes | Simple mode bit checks |
| **Testability:** | Yes | Temp files with known permissions |
| **Documentation:** | Yes | Architecture doc covers rationale |

### Evolution Vectors

| What Might Change | Preparation | Impact |
|------------------|-------------|--------|
| Windows support | Platform check already planned | Low |
| ACL-based permissions | Out of scope, would need new module | Medium |

### Deletion Criteria

- [ ] Feature superseded by: OS-level mandatory access control
- [ ] Maintenance cost exceeds value when: never (simple, static)
