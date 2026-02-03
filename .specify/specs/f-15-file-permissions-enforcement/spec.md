---
id: "F-15"
feature: "File permissions enforcement"
status: "draft"
created: "2026-02-03"
---

# Specification: File Permissions Enforcement

## Overview

The blackboard database contains coordination metadata about agent activity. While not secret, it should not be world-readable — it reveals what an operator is working on and their project structure. This feature enforces restrictive file permissions on database creation and validates permissions on open. Defense in depth: the primary protection is that the database is local-only, but permissions add a layer against accidental exposure.

## User Scenarios

### Scenario 1: Secure database creation

**As a** PAI operator
**I want to** have the database created with restrictive permissions automatically
**So that** other users on a shared machine cannot read my coordination data

**Acceptance Criteria:**
- [ ] Database file created with mode 0600 (owner read/write only)
- [ ] WAL file (.db-wal) created with mode 0600
- [ ] SHM file (.db-shm) created with mode 0600
- [ ] Containing directory created with mode 0700 (owner access only)

### Scenario 2: Permission validation on open

**As a** PAI operator
**I want to** be warned if my database has been made world-readable
**So that** I can fix it before sensitive coordination data leaks

**Acceptance Criteria:**
- [ ] Opening a database with group-readable permissions logs a warning
- [ ] Opening a database with world-readable permissions refuses to open and errors
- [ ] Error message includes the file path and current permissions
- [ ] Error message includes the fix command (`chmod 600 <path>`)

## Functional Requirements

### FR-1: Set permissions on database creation

After creating the database file, set file mode to 0600. After creating the directory, set mode to 0700. Apply to all three SQLite files (.db, .db-wal, .db-shm) when they exist.

**Validation:** Create database, `stat -f %Lp` returns `600` for files and `700` for directory.

### FR-2: Validate permissions on database open

Before opening an existing database, check file permissions. If world-readable (o+r), refuse to open with error. If group-readable (g+r), log warning but continue.

**Validation:** `chmod 644 db`, attempt open — should error. `chmod 640 db`, attempt open — should warn. `chmod 600 db` — should open silently.

### FR-3: Permission fix helper

When refusing to open due to bad permissions, include actionable fix command in the error message.

**Validation:** Error message contains `chmod 600 <actual-path>`.

## Non-Functional Requirements

- **Performance:** Permission check adds <1ms to database open
- **Security:** This is the security feature — it prevents information disclosure
- **Failure Behavior:**
  - On permission check failure (stat error): Log warning, continue (don't block operation)
  - On chmod failure during creation: Log warning with path, continue (permissions are defense-in-depth)

## Key Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| Database files | .db, .db-wal, .db-shm | File path, mode bits |
| Database directory | .blackboard/ or ~/.pai/blackboard/ | Directory path, mode bits |

## Success Criteria

- [ ] New databases created with 0600 file and 0700 directory permissions
- [ ] World-readable databases refused on open with clear error
- [ ] Group-readable databases warn on open
- [ ] WAL and SHM files also checked/set
- [ ] Permission operations work on macOS and Linux

## Assumptions

| Assumption | What Would Invalidate It | Detection Strategy |
|-----------|-------------------------|-------------------|
| OS supports POSIX permissions | Windows deployment | Platform check, skip on Windows |
| Bun's fs.chmod works correctly | Bun bug | Test in CI |

## System Context

### Upstream Dependencies

| System | What We Get | What Breaks If It Changes | Version/Contract |
|--------|-------------|---------------------------|------------------|
| F-1 Database init | Database path resolution | Path format changes | resolveDbPath() API |
| Node.js fs module | chmod, stat operations | API changes | Node.js compat |

### Downstream Consumers

| System | What They Expect | Breaking Change Threshold |
|--------|-----------------|--------------------------|
| All features | Database opens successfully with correct permissions | N/A |

## Out of Scope

- Network-level access control (database is never networked)
- Encryption at rest
- ACL-based permissions (POSIX mode bits only)
- Windows permission model
