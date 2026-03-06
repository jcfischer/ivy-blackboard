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
  "waiting_for_response",
  "failed",
  "quarantined",
] as const;
export type WorkItemStatus = (typeof WORK_ITEM_STATUSES)[number];

// Work item priority values
export const WORK_ITEM_PRIORITIES = ["P1", "P2", "P3"] as const;
export type WorkItemPriority = (typeof WORK_ITEM_PRIORITIES)[number];

// Well-known work item source values (conventions, not exhaustive — any non-empty string is valid)
export const WELL_KNOWN_SOURCES = ["github", "local", "operator"] as const;
export type WorkItemSource = string;

// Known blackboard event types (not exhaustive — downstream consumers may define their own)
export const KNOWN_EVENT_TYPES = [
  "agent_registered",
  "agent_deregistered",
  "agent_stale",
  "agent_recovered",
  "work_claimed",
  "work_released",
  "work_completed",
  "work_blocked",
  "work_created",
  "work_deleted",
  "metadata_updated",
  "comment_received",
  "work_approved",
  "work_rejected",
  "project_registered",
  "project_updated",
  "heartbeat_received",
  "stale_locks_released",
  "content_blocked",
  "content_reviewed",
] as const;
export type KnownEventType = (typeof KNOWN_EVENT_TYPES)[number];

// Event type is free-form text — no CHECK constraint in the database
export type EventType = string;

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
  metadata: string | null; // JSON blob
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

// SpecFlow feature phase values (state machine)
export const SPECFLOW_FEATURE_PHASES = [
  "queued",
  "specifying", "specified",
  "planning", "planned",
  "tasking", "tasked",
  "implementing", "implemented",
  "completing", "completed",
  "failed", "blocked",
] as const;
export type SpecFlowFeaturePhase = (typeof SPECFLOW_FEATURE_PHASES)[number];

// SpecFlow feature status values
export const SPECFLOW_FEATURE_STATUSES = [
  "pending",
  "active",
  "succeeded",
  "failed",
  "blocked",
] as const;
export type SpecFlowFeatureStatus = (typeof SPECFLOW_FEATURE_STATUSES)[number];

export interface SpecFlowFeature {
  feature_id: string;
  project_id: string;
  title: string;
  description: string | null;
  phase: SpecFlowFeaturePhase;
  status: SpecFlowFeatureStatus;
  current_session: string | null;
  worktree_path: string | null;
  branch_name: string | null;
  main_branch: string;
  failure_count: number;
  max_failures: number;
  last_error: string | null;
  last_phase_error: string | null;
  specify_score: number | null;
  plan_score: number | null;
  implement_score: number | null;
  pr_number: number | null;
  pr_url: string | null;
  commit_sha: string | null;
  github_issue_number: number | null;
  github_issue_url: string | null;
  github_repo: string | null;
  source: string;
  source_ref: string | null;
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
  phase_started_at: string | null;
  completed_at: string | null;
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
