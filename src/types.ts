// Agent status values (matches CHECK constraint)
export const AGENT_STATUSES = [
  "active",
  "idle",
  "completed",
  "stale",
] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

// Work item status values
export const WORK_ITEM_STATUSES = [
  "available",
  "claimed",
  "completed",
  "blocked",
] as const;
export type WorkItemStatus = (typeof WORK_ITEM_STATUSES)[number];

// Work item priority values
export const WORK_ITEM_PRIORITIES = ["P1", "P2", "P3"] as const;
export type WorkItemPriority = (typeof WORK_ITEM_PRIORITIES)[number];

// Work item source values
export const WORK_ITEM_SOURCES = ["github", "local", "operator"] as const;
export type WorkItemSource = (typeof WORK_ITEM_SOURCES)[number];

// Event type values (14 types)
export const EVENT_TYPES = [
  "agent_registered",
  "agent_deregistered",
  "agent_stale",
  "agent_recovered",
  "work_claimed",
  "work_released",
  "work_completed",
  "work_blocked",
  "work_created",
  "project_registered",
  "project_updated",
  "heartbeat_received",
  "stale_locks_released",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

// Target type for events
export const TARGET_TYPES = ["agent", "work_item", "project"] as const;
export type TargetType = (typeof TARGET_TYPES)[number];

// Entity interfaces matching SQL schema

export interface BlackboardAgent {
  session_id: string;
  agent_name: string;
  pid: number | null;
  parent_id: string | null;
  project: string | null;
  current_work: string | null;
  status: AgentStatus;
  started_at: string; // ISO 8601
  last_seen_at: string; // ISO 8601
  metadata: string | null; // JSON blob
}

export interface BlackboardProject {
  project_id: string;
  display_name: string;
  local_path: string | null;
  remote_repo: string | null;
  registered_at: string; // ISO 8601
  metadata: string | null; // JSON blob
}

export interface BlackboardWorkItem {
  item_id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  source: WorkItemSource;
  source_ref: string | null;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  claimed_by: string | null;
  claimed_at: string | null;
  completed_at: string | null;
  blocked_by: string | null;
  created_at: string; // ISO 8601
  metadata: string | null; // JSON blob
}

export interface BlackboardHeartbeat {
  id: number;
  session_id: string;
  timestamp: string; // ISO 8601
  progress: string | null;
  work_item_id: string | null;
}

export interface BlackboardEvent {
  id: number;
  timestamp: string; // ISO 8601
  event_type: EventType;
  actor_id: string | null;
  target_id: string | null;
  target_type: TargetType | null;
  summary: string;
  metadata: string | null; // JSON blob
}

export interface MigrationEntry {
  version: number;
  applied_at: string; // ISO 8601
  description: string | null;
}

export interface DbOptions {
  dbPath?: string;
  envPath?: string;
}
