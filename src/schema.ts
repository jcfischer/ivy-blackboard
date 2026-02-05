export const CURRENT_SCHEMA_VERSION = 3;

export const PRAGMA_SQL = [
  "PRAGMA journal_mode = WAL;",
  "PRAGMA foreign_keys = ON;",
  "PRAGMA busy_timeout = 5000;",
];

export const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS agents (
    session_id    TEXT PRIMARY KEY,
    agent_name    TEXT NOT NULL,
    pid           INTEGER,
    parent_id     TEXT,
    project       TEXT,
    current_work  TEXT,
    status        TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'idle', 'completed', 'stale')),
    started_at    TEXT NOT NULL,
    last_seen_at  TEXT NOT NULL,
    metadata      TEXT,

    FOREIGN KEY (parent_id) REFERENCES agents(session_id)
);

CREATE TABLE IF NOT EXISTS projects (
    project_id    TEXT PRIMARY KEY,
    display_name  TEXT NOT NULL,
    local_path    TEXT,
    remote_repo   TEXT,
    registered_at TEXT NOT NULL,
    metadata      TEXT
);

CREATE TABLE IF NOT EXISTS work_items (
    item_id       TEXT PRIMARY KEY,
    project_id    TEXT,
    title         TEXT NOT NULL,
    description   TEXT,
    source        TEXT NOT NULL
                  CHECK (source IN ('github', 'local', 'operator')),
    source_ref    TEXT,
    status        TEXT NOT NULL DEFAULT 'available'
                  CHECK (status IN ('available', 'claimed', 'completed', 'blocked')),
    priority      TEXT DEFAULT 'P2'
                  CHECK (priority IN ('P1', 'P2', 'P3')),
    claimed_by    TEXT,
    claimed_at    TEXT,
    completed_at  TEXT,
    blocked_by    TEXT,
    created_at    TEXT NOT NULL,
    metadata      TEXT,

    FOREIGN KEY (project_id) REFERENCES projects(project_id),
    FOREIGN KEY (claimed_by) REFERENCES agents(session_id)
);

CREATE TABLE IF NOT EXISTS heartbeats (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id    TEXT NOT NULL,
    timestamp     TEXT NOT NULL,
    progress      TEXT,
    work_item_id  TEXT,
    metadata      TEXT,

    FOREIGN KEY (session_id) REFERENCES agents(session_id),
    FOREIGN KEY (work_item_id) REFERENCES work_items(item_id)
);

CREATE TABLE IF NOT EXISTS events (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp     TEXT NOT NULL,
    event_type    TEXT NOT NULL,
    actor_id      TEXT,
    target_id     TEXT,
    target_type   TEXT
                  CHECK (target_type IN ('agent', 'work_item', 'project')),
    summary       TEXT NOT NULL,
    metadata      TEXT
);

CREATE TABLE IF NOT EXISTS schema_version (
    version       INTEGER PRIMARY KEY,
    applied_at    TEXT NOT NULL,
    description   TEXT
);
`;

export const CREATE_INDEXES_SQL = `
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_project ON agents(project);
CREATE INDEX IF NOT EXISTS idx_agents_parent ON agents(parent_id);
CREATE INDEX IF NOT EXISTS idx_agents_last_seen ON agents(last_seen_at);

CREATE INDEX IF NOT EXISTS idx_work_items_status ON work_items(status);
CREATE INDEX IF NOT EXISTS idx_work_items_project ON work_items(project_id);
CREATE INDEX IF NOT EXISTS idx_work_items_claimed_by ON work_items(claimed_by);
CREATE INDEX IF NOT EXISTS idx_work_items_priority ON work_items(priority, status);

CREATE INDEX IF NOT EXISTS idx_heartbeats_session ON heartbeats(session_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_heartbeats_timestamp ON heartbeats(timestamp);

CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_actor ON events(actor_id);
`;

export const SEED_VERSION_SQL = `
INSERT OR IGNORE INTO schema_version (version, applied_at, description)
VALUES (1, datetime('now'), 'Initial local blackboard schema');
INSERT OR IGNORE INTO schema_version (version, applied_at, description)
VALUES (2, datetime('now'), 'Remove event_type CHECK constraint');
INSERT OR IGNORE INTO schema_version (version, applied_at, description)
VALUES (3, datetime('now'), 'Add metadata column to heartbeats');
`;

/**
 * Migration SQL for v1 → v2: Remove event_type CHECK constraint.
 * SQLite doesn't support ALTER CHECK constraints directly,
 * so we recreate the events table without the constraint.
 */
export const MIGRATE_V2_SQL = `
CREATE TABLE events_v2 (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp     TEXT NOT NULL,
    event_type    TEXT NOT NULL,
    actor_id      TEXT,
    target_id     TEXT,
    target_type   TEXT
                  CHECK (target_type IN ('agent', 'work_item', 'project')),
    summary       TEXT NOT NULL,
    metadata      TEXT
);

INSERT INTO events_v2 SELECT * FROM events;
DROP TABLE events;
ALTER TABLE events_v2 RENAME TO events;

CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_actor ON events(actor_id);
`;

/**
 * Migration SQL for v2 → v3: Add metadata column to heartbeats table.
 * Simple ALTER TABLE ADD COLUMN — SQLite supports this natively.
 */
export const MIGRATE_V3_SQL = `
ALTER TABLE heartbeats ADD COLUMN metadata TEXT;
`;

