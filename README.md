# ivy-blackboard

Local Agent Blackboard -- SQLite-based multi-agent coordination for PAI.

A shared coordination layer that lets multiple Claude Code agents (or any CLI-driven agents) register, claim work, send heartbeats, and observe each other through a single local SQLite database.

## Quick Start

```bash
bun install

# Register an agent
blackboard agent register --name "my-agent"

# Register a project
blackboard project register --id my-project --name "My Project" --path .

# Create and claim a work item
blackboard work create --id task-1 --title "Implement feature X" --project my-project
blackboard work claim task-1 --session <session-id>

# Check status
blackboard status

# Start the web dashboard
blackboard serve --port 3141
```

## Commands

| Command | Description |
|---------|-------------|
| `agent register` | Register a new agent session |
| `agent deregister` | End an agent session |
| `agent heartbeat` | Send a heartbeat with progress |
| `agent list` | List agent sessions |
| `project register` | Register a project |
| `project list` | List projects |
| `project status <id>` | Show project detail with agents and work |
| `work create` | Create a work item |
| `work claim` | Claim a work item |
| `work release` | Release a claimed work item |
| `work complete` | Mark a work item as completed |
| `work block` | Block a work item |
| `work unblock` | Unblock a work item |
| `work list` | List work items |
| `work status <id>` | Show work item detail |
| `observe` | Show event log |
| `status` | Show overall blackboard health |
| `sweep` | Detect and clean up stale agents |
| `export` | Export full state snapshot as JSON |
| `serve` | Start the web dashboard server |

All commands support `--json` for machine-readable output.

## Architecture

```
blackboard CLI
    |
    v
Commander.js routing (src/commands/*.ts)
    |
    v
Core modules (src/*.ts)
    |
    v
SQLite database (bun:sqlite)
```

**Database tables:** `agents`, `projects`, `work_items`, `heartbeats`, `events`, `migrations`

**Key design decisions:**

- Single SQLite file, no network dependencies
- Transactional writes with event emission
- Automatic stale agent detection via PID liveness checking
- Content filtering (sanitizeText) on all user-supplied text fields
- 600 permissions on database file

## Web Dashboard

`blackboard serve` starts a local HTTP server with:

- **REST API** at `/api/status`, `/api/agents`, `/api/work`, `/api/events`, `/api/projects`
- **SSE** at `/api/events/stream` for live event updates
- **HTML dashboard** at `/` with auto-refresh and dark theme

## Configuration

Optional `blackboard.json` in the working directory:

```json
{
  "database": {
    "operatorPath": "~/.pai/blackboard/local.db",
    "projectDir": ".blackboard"
  },
  "heartbeat": {
    "intervalSeconds": 60,
    "staleThresholdSeconds": 300
  },
  "contentFilter": {
    "maxFieldLength": 500,
    "stripCodeBlocks": true,
    "stripHtmlTags": true
  }
}
```

All fields have defaults -- the config file is optional.

## Testing

```bash
bun test          # 294 tests across 18 files
```

## Stack

- **Runtime:** Bun
- **Database:** SQLite (bun:sqlite)
- **CLI:** Commander.js
- **Validation:** Zod
- **Dashboard:** Vanilla HTML/CSS/JS (no build step)

## License

MIT
