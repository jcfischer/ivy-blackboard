---
id: "F-19"
feature: "Spoke export integration"
feature_id: "F-19"
status: "draft"
priority: 3
depends_on: ["F-1", "F-5", "F-7", "F-10", "F-12", "F-13"]
---

# Specification: Spoke Export Integration

## Problem

External tools, dashboards, and CI systems need to consume blackboard state in a machine-readable format. Without a standardized export mechanism, these consumers must directly query the database or parse human-readable output. An export command provides a JSON snapshot of the entire blackboard state for downstream consumption.

## Users

- **Spoke dashboards** displaying current work distribution
- **CI/CD systems** reading work status for pipeline decisions
- **External monitoring tools** ingesting blackboard state
- **Backup/sync systems** capturing point-in-time snapshots

## Functional Requirements

### FR-1: exportSnapshot(db, dbPath, opts)

Returns a complete blackboard snapshot as a JSON-serializable object:

```typescript
interface ExportSnapshot {
  export_version: 1,                    // Schema version for compatibility
  timestamp: string,                     // ISO 8601 when snapshot was taken
  database: {
    path: string,                        // Full path to database
    size_bytes: number                   // File size in bytes
  },
  status: {
    agents: { active: number; idle: number; stale: number; completed: number },
    work_items: { available: number; claimed: number; completed: number; blocked: number },
    projects: number,
    events_24h: number
  },
  agents: Agent[],                       // All agents (from listAgents)
  projects: Project[],                   // All projects (from listProjects)
  work_items: WorkItem[],                // All work items (from listWorkItems)
  recent_events: Event[]                 // Last 100 events (from observeEvents)
}
```

**Data extraction:**
- Use existing core functions: `getOverallStatus()`, `listAgents()`, `listProjects()`, `listWorkItems()`, `observeEvents()`
- Snapshot includes complete state at call time
- Events limited to last 100 for reasonable JSON size

**Types:**
```typescript
interface Agent {
  session_id: string;
  agent_name: string;
  status: 'active' | 'idle' | 'completed' | 'stale';
  project: string | null;
  current_work: string | null;
  started_at: string;
  last_seen_at: string;
}

interface Project {
  project_id: string;
  display_name: string;
  local_path: string | null;
  remote_repo: string | null;
  registered_at: string;
}

interface WorkItem {
  item_id: string;
  project_id: string;
  title: string;
  status: 'available' | 'claimed' | 'completed' | 'blocked';
  priority: 'P1' | 'P2' | 'P3';
  claimed_by: string | null;
  claimed_at: string | null;
  completed_at: string | null;
}

interface Event {
  id: number;
  timestamp: string;
  event_type: string;
  actor_id: string | null;
  summary: string;
}
```

### FR-2: CLI Command

```bash
blackboard export [--format json] [--pretty] [--output <file>]
```

**Options:**
- `--format json` (default, only format for now) — Output JSON
- `--pretty` — Pretty-print JSON with 2-space indentation
- `--output <file>` — Write to file instead of stdout

**Examples:**

```bash
# Write to stdout (compact)
blackboard export

# Pretty-print to stdout
blackboard export --pretty

# Write to file
blackboard export --output snapshot.json

# Pretty-print to file
blackboard export --pretty --output snapshot.json
```

**Output behavior:**
- Stdout: compact JSON (no indentation) unless `--pretty`
- File: as specified above
- Exit code 0 on success, non-zero on failure

**Error handling:**
- If `--output` file is not writable: error message with path, exit 1
- If database unreachable: error message, exit 1

## Non-Functional Requirements

- Export time: < 500ms for databases with < 1000 total rows
- JSON schema stable: `export_version: 1` is immutable
- Schema versioning: Future exports may increment version (no backward compat guarantee beyond version 1)
- File write: Atomic (write to temp file, rename)
- No writes to database during export (read-only operation)

## Success Criteria

- [ ] `exportSnapshot()` returns complete snapshot with all fields
- [ ] JSON is valid and parseable
- [ ] `blackboard export` outputs JSON to stdout
- [ ] `--pretty` flag formats with indentation
- [ ] `--output <file>` writes to file atomically
- [ ] Snapshot includes status aggregates and recent_events (last 100)
- [ ] Works with both project-local and operator-wide databases
- [ ] Export succeeds on empty database (zero counts, empty arrays)

## Out of Scope

- Schema evolution (F-21, future)
- Incremental/delta exports
- Real-time streaming export
- Database replication or sync (external tools)
- Spoke dashboard UI (external project)
