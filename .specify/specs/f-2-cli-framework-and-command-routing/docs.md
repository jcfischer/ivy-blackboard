# Documentation: F-2 CLI Framework and Command Routing

## Files Created

| File | Purpose |
|------|---------|
| `src/index.ts` | CLI entry point with Commander.js program |
| `src/context.ts` | Database context creation and caching |
| `src/output.ts` | JSON envelope and ASCII table formatting |
| `src/errors.ts` | BlackboardError class and error handler wrapper |
| `src/commands/agent.ts` | Agent command group stubs |
| `src/commands/project.ts` | Project command group stubs |
| `src/commands/work.ts` | Work command group stubs |
| `src/commands/observe.ts` | Observe command stub |
| `src/commands/serve.ts` | Serve command stub |
| `src/commands/sweep.ts` | Sweep command stub |
| `src/commands/status.ts` | Status command (fully implemented) |

## Usage

```bash
blackboard --help                  # Show all commands
blackboard status                  # Overall health (human readable)
blackboard status --json           # Overall health (JSON envelope)
blackboard --db /path/to/db status # Use specific database
blackboard agent list              # List agents (stub)
```

## Global Options

| Option | Description |
|--------|-------------|
| `-j, --json` | Output as JSON envelope |
| `--db <path>` | Override database path |
| `-V, --version` | Show version |

## Dependencies Added

- `commander@14.x` — CLI framework
- `zod@4.x` — Input validation
