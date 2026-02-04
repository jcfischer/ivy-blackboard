---
feature: "Overall status command"
feature_id: "F-13"
status: "draft"
priority: 3
depends_on: ["F-1", "F-3", "F-7", "F-8"]
---

# Specification: Overall Status Command

## Problem

Operators need a single command to assess blackboard health at a glance. Without a status view, operators must run multiple list commands (agents, work, projects) and manually correlate the information. A consolidated status command provides operational visibility: how many agents are active, what work is pending, and recent activity levels.

## Users

- **Operators** who need quick health checks
- **Monitoring scripts** that need machine-readable status (--json)
- **Debugging sessions** where understanding the current state is step one

## Functional Requirements

### FR-1: getOverallStatus(db, dbPath)

Returns an aggregate status object:

```typescript
{
  database: string,            // Full path to database file
  database_size: string,       // Human-readable size (e.g., "42.3 KB")
  agents: {
    active: number,
    idle: number,
    stale: number,
    completed: number
  },
  work_items: {
    available: number,
    claimed: number,
    completed: number,
    blocked: number
  },
  projects: number,            // Total registered projects
  events_24h: number,          // Events in last 24 hours
  active_agents: Array<{       // Details of active agents only
    session_id: string,
    agent_name: string,
    project: string | null,
    current_work: string | null,
    last_seen_at: string
  }>
}
```

**Database size calculation:**
- Use `fs.statSync(dbPath).size` to get bytes
- Format as human-readable: bytes, KB, MB (1 KB = 1024 bytes)
- If stat fails, return "unknown"

**Queries:**
- Agent counts: `SELECT status, COUNT(*) FROM agents GROUP BY status`
- Work counts: `SELECT status, COUNT(*) FROM work_items GROUP BY status`
- Project count: `SELECT COUNT(*) FROM projects`
- Events 24h: `SELECT COUNT(*) FROM events WHERE timestamp > datetime('now', '-24 hours')`
- Active agents: `SELECT session_id, agent_name, project, current_work, last_seen_at FROM agents WHERE status = 'active'`

### FR-2: CLI Command

```bash
blackboard status [--json]
```

**Human-readable output:**
```
Local Blackboard Status
Database: /Users/operator/.pai/blackboard/local.db (42.3 KB)

Agents:    2 active, 1 idle, 0 stale, 5 completed
Projects:  3 registered
Work:      1 claimed, 4 available, 0 blocked, 12 completed
Events:    47 (last 24h)

Active Agents:
SESSION       NAME         PROJECT      WORK                LAST SEEN
abc123456789  Engineer     ivy-board    F-13 implementation 2026-02-03T23:15:00Z
def987654321  Planner      ivy-board    --                  2026-02-03T23:10:00Z
```

**JSON output:**
```json
{
  "ok": true,
  "database": "/Users/operator/.pai/blackboard/local.db",
  "database_size": "42.3 KB",
  "agents": {
    "active": 2,
    "idle": 1,
    "stale": 0,
    "completed": 5
  },
  "work_items": {
    "available": 4,
    "claimed": 1,
    "completed": 12,
    "blocked": 0
  },
  "projects": 3,
  "events_24h": 47,
  "active_agents": [
    {
      "session_id": "abc123456789",
      "agent_name": "Engineer",
      "project": "ivy-board",
      "current_work": "F-13 implementation",
      "last_seen_at": "2026-02-03T23:15:00Z"
    }
  ],
  "timestamp": "2026-02-03T23:16:00.000Z"
}
```

**Formatting notes:**
- Session IDs truncated to 12 characters in table view
- Null fields display as "--" in table
- Use `formatJson()` for JSON mode
- Use `formatTable()` for active agents table

## Non-Functional Requirements

- Query performance: < 50ms for databases with < 1000 total rows
- No write operations (read-only queries)
- Works on empty database (all counts zero)

## Success Criteria

- [ ] Human output shows all 5 metrics (agents, projects, work, events, DB size)
- [ ] JSON output includes full structure with timestamp
- [ ] Active agents table displays when agents exist
- [ ] Database size formatted correctly (KB/MB)
- [ ] Empty database shows all zeros without errors
- [ ] Command works with both project-local and operator-wide databases

## Out of Scope

- Historical trending (future feature)
- Per-project filtering (use agent list --project)
- Real-time updates / watch mode
- Performance metrics beyond basic counts
