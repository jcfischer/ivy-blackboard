# Documentation: F-7 Project Register and List Commands

## Files Created

| File | Purpose |
|------|---------|
| `src/project.ts` | Core logic: registerProject, listProjects |

## Files Modified

| File | Change |
|------|--------|
| `src/commands/project.ts` | Replaced register/list stubs with real implementations |

## Usage

```bash
# Register a project
blackboard project register --id "pai-collab" --name "PAI Collab" --path "/path/to/project" --repo "org/repo"

# Register with metadata
blackboard project register --id "myproj" --name "My Project" --metadata '{"branch": "main"}'

# List all projects with active agent counts
blackboard project list

# JSON output
blackboard project register --id "proj" --name "Project" --json
blackboard project list --json
```

## API Reference

### `registerProject(db, opts): RegisterProjectResult`
Inserts project row, validates metadata JSON, emits `project_registered` event. All in one transaction. Throws on duplicate project_id or invalid metadata.

**Options:** `id` (required), `name` (required), `path?`, `repo?`, `metadata?` (JSON string)

### `listProjects(db): ProjectWithCounts[]`
Queries all projects with LEFT JOIN to agents for active agent counts. Ordered by registered_at DESC.
