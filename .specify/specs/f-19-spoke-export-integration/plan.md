---
feature: "Spoke export integration"
spec: "./spec.md"
status: "draft"
---

# Technical Plan: Spoke Export Integration

## Architecture Overview

A single `export.ts` module that composes existing core functions into a complete snapshot. The CLI command in `src/commands/export.ts` wires the export function with file I/O and formatting options.

```
CLI invocation: blackboard export [--pretty] [--output <file>]
    |
    v
exportSnapshot(db, dbPath, opts)
    |
    ├─ getOverallStatus(db, dbPath)          # Status aggregates
    ├─ listAgents(db)                        # All agents
    ├─ listProjects(db)                      # All projects
    ├─ listWorkItems(db)                     # All work items
    └─ observeEvents(db, limit: 100)         # Recent 100 events
    |
    v
ExportSnapshot object
    |
    ├─ (--pretty) JSON.stringify(..., null, 2)
    └─ (else) JSON.stringify(...)
    |
    v
(--output <file>) ? writeFileSync(...) : stdout
```

## Technology Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Language | TypeScript | PAI standard |
| Runtime | Bun | PAI standard |
| Serialization | JSON.stringify | Built-in, no dependency |
| File I/O | `node:fs` writeFileSync | Atomic write with temp file handling |
| Validation | Zod | Input validation for options |

## Constitutional Compliance

- [x] **CLI-First:** Export command is invoked via CLI, no separate export step
- [x] **Library-First:** `exportSnapshot()` is a pure library function — no CLI coupling
- [x] **Test-First:** Unit tests for snapshot assembly, file I/O, formatting
- [x] **Reuse:** Leverages existing core functions (getOverallStatus, listAgents, etc.)
- [x] **Code Before Prompts:** Export logic defined in TypeScript, not generated

## Data Model

### TypeScript interfaces

```typescript
interface ExportOptions {
  pretty?: boolean;           // --pretty flag
  output?: string;            // --output <file>
}

interface ExportSnapshot {
  export_version: 1;
  timestamp: string;
  database: {
    path: string;
    size_bytes: number;
  };
  status: {
    agents: Record<string, number>;
    work_items: Record<string, number>;
    projects: number;
    events_24h: number;
  };
  agents: Agent[];
  projects: Project[];
  work_items: WorkItem[];
  recent_events: Event[];
}
```

### Database queries

All data sourced from existing queries in core functions:
- Status aggregates: `SELECT status, COUNT(*) FROM agents/work_items GROUP BY status`
- Agents: Full agent records from `agents` table
- Projects: Full project records from `projects` table
- Work items: Full work item records from `work_items` table
- Events: Last 100 events ordered by timestamp DESC

## API Contracts

### Internal APIs

```typescript
// Main export function
function exportSnapshot(
  db: Database,
  dbPath: string,
  opts?: ExportOptions
): ExportSnapshot;

// Formatting helper
function formatExportJson(snapshot: ExportSnapshot, pretty?: boolean): string;

// File writing helper (atomic)
function writeExportToFile(json: string, filePath: string): void;
```

### CLI Contract

```bash
blackboard export [--pretty] [--output <file>]
```

Exit codes:
- 0: Success (snapshot written)
- 1: File I/O error, database error, validation error

## Implementation Strategy

### Phase 1: Export function

- [ ] `exportSnapshot(db, dbPath, opts)` that calls core functions
- [ ] Compose results into ExportSnapshot structure
- [ ] Include database size calculation (fs.statSync)
- [ ] Unit tests for snapshot assembly

### Phase 2: CLI wiring

- [ ] `src/commands/export.ts` command handler
- [ ] Parse `--pretty`, `--output` options with Zod
- [ ] Validate file path is writable (if --output)
- [ ] Call exportSnapshot and format result

### Phase 3: File I/O

- [ ] `writeExportToFile()` with atomic write (temp + rename)
- [ ] Handle write errors with clear messages
- [ ] Integration tests for file output

## File Structure

```
src/
├── export.ts                 # [New] exportSnapshot function
├── commands/export.ts        # [New] CLI command handler
├── types.ts                  # [Update] Add ExportOptions, ExportSnapshot

tests/
├── export.test.ts            # [New] Unit tests for exportSnapshot
├── commands/export.test.ts   # [New] CLI integration tests
```

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| File write fails (disk full, permission denied) | Medium | Low | Atomic write with temp file, clear error message |
| Database unreachable during export | Medium | Low | Pass db handle; if error, propagate clearly |
| JSON serialization of large snapshot | Low | Very low | Limit events to 100; database unlikely to have thousands of rows |
| Schema version mismatch in downstream consumers | Low | Medium | Version 1 immutable; future versions incremented carefully |

## Failure Mode Analysis

### How This Code Can Fail

| Failure Mode | Trigger | Detection | Degradation | Recovery |
|-------------|---------|-----------|-------------|----------|
| File not writable | Permission denied, disk full | writeFileSync throws | Exit 1, clear error | User fixes permissions/disk |
| Database unreachable | DB file deleted/corrupted | DB query fails | Exit 1, error message | User checks database |
| JSON circular reference | Should not occur (data is acyclic) | JSON.stringify throws | Exit 1 | Code bug (report) |
| Very large snapshot | Thousands of events | Memory pressure | Succeed but slow | Use event limit |

### Blast Radius

- **Files touched:** ~3 new/modified files
- **Systems affected:** None (read-only)
- **Rollback strategy:** Delete export file, no database changes

## Dependencies

### External

- `node:fs` (Bun built-in) — File I/O, stat
- `node:path` (Bun built-in) — Path resolution for temp files
- `zod` (already in project) — Option validation

### Internal

- `src/db.ts` — Database handle
- `src/core.ts` — getOverallStatus, listAgents, listProjects, listWorkItems, observeEvents (assumed)
- `src/types.ts` — Agent, Project, WorkItem, Event types

## Migration/Deployment

- [ ] No database changes (export is read-only)
- [ ] No new environment variables
- [ ] No breaking changes
- [ ] Backward compatible (new command, no changes to existing)

## Estimated Complexity

- **New files:** ~2
- **Modified files:** ~1
- **Test files:** ~2
- **Estimated tasks:** ~2
- **Debt score:** 1 (clean, reuses existing functions)

## Longevity Assessment

### Maintainability Indicators

| Indicator | Status | Notes |
|-----------|--------|-------|
| **Readability:** Can a developer understand this in 6 months? | Yes | Composition of existing functions is straightforward |
| **Testability:** Can changes be verified without manual testing? | Yes | Unit tests for snapshot, integration tests for CLI |
| **Documentation:** Is the "why" captured, not just the "what"? | Yes | Spec explains external consumer needs |

### Evolution Vectors

| What Might Change | Preparation | Impact |
|------------------|-------------|--------|
| New fields in status | Add to ExportSnapshot | Low |
| Filter options (--project, --since) | Add optional parameters | Medium |
| Export format (YAML, CSV) | Add format parameter | Medium |
| Schema version 2 | Increment version, add migration | Medium |

### Deletion Criteria

- [ ] Feature superseded by: Spoke native export API
- [ ] User need eliminated: External integrations deprecated
- [ ] Maintenance cost exceeds value when: Too many export formats to maintain
