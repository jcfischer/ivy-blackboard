import { describe, expect, it } from "bun:test";
import {
  type BlackboardAgent,
  type BlackboardProject,
  type BlackboardWorkItem,
  type BlackboardEvent,
  type BlackboardHeartbeat,
  type MigrationEntry,
  type DbOptions,
  AgentStatus,
  WorkItemStatus,
  WorkItemPriority,
  WorkItemSource,
  EventType,
  AGENT_STATUSES,
  WORK_ITEM_STATUSES,
  WORK_ITEM_PRIORITIES,
  WORK_ITEM_SOURCES,
  KNOWN_EVENT_TYPES,
} from "../src/types";

describe("types", () => {
  describe("AgentStatus", () => {
    it("has exactly 4 values", () => {
      expect(AGENT_STATUSES).toEqual(["active", "idle", "completed", "stale"]);
    });
  });

  describe("WorkItemStatus", () => {
    it("has exactly 4 values", () => {
      expect(WORK_ITEM_STATUSES).toEqual([
        "available",
        "claimed",
        "completed",
        "blocked",
      ]);
    });
  });

  describe("WorkItemPriority", () => {
    it("has exactly 3 values", () => {
      expect(WORK_ITEM_PRIORITIES).toEqual(["P1", "P2", "P3"]);
    });
  });

  describe("WorkItemSource", () => {
    it("has exactly 3 values", () => {
      expect(WORK_ITEM_SOURCES).toEqual(["github", "local", "operator"]);
    });
  });

  describe("EventType", () => {
    it("KNOWN_EVENT_TYPES lists 13 known blackboard event types", () => {
      expect(KNOWN_EVENT_TYPES).toHaveLength(13);
      expect(KNOWN_EVENT_TYPES).toContain("agent_registered");
      expect(KNOWN_EVENT_TYPES).toContain("agent_deregistered");
      expect(KNOWN_EVENT_TYPES).toContain("agent_stale");
      expect(KNOWN_EVENT_TYPES).toContain("agent_recovered");
      expect(KNOWN_EVENT_TYPES).toContain("work_claimed");
      expect(KNOWN_EVENT_TYPES).toContain("work_released");
      expect(KNOWN_EVENT_TYPES).toContain("work_completed");
      expect(KNOWN_EVENT_TYPES).toContain("work_blocked");
      expect(KNOWN_EVENT_TYPES).toContain("work_created");
      expect(KNOWN_EVENT_TYPES).toContain("project_registered");
      expect(KNOWN_EVENT_TYPES).toContain("project_updated");
      expect(KNOWN_EVENT_TYPES).toContain("heartbeat_received");
      expect(KNOWN_EVENT_TYPES).toContain("stale_locks_released");
    });

    it("EventType is string (free-form, not constrained)", () => {
      const customType: EventType = "heartbeat_check";
      expect(typeof customType).toBe("string");
    });
  });

  describe("type shapes", () => {
    it("BlackboardAgent has required fields", () => {
      const agent: BlackboardAgent = {
        session_id: "test-uuid",
        agent_name: "Ivy",
        pid: 12345,
        parent_id: null,
        project: "test-project",
        current_work: "testing",
        status: "active",
        started_at: "2026-02-03T00:00:00Z",
        last_seen_at: "2026-02-03T00:00:00Z",
        metadata: null,
      };
      expect(agent.session_id).toBe("test-uuid");
      expect(agent.status).toBe("active");
    });

    it("BlackboardWorkItem has required fields", () => {
      const item: BlackboardWorkItem = {
        item_id: "test-item",
        project_id: null,
        title: "Test item",
        description: null,
        source: "local",
        source_ref: null,
        status: "available",
        priority: "P2",
        claimed_by: null,
        claimed_at: null,
        completed_at: null,
        blocked_by: null,
        created_at: "2026-02-03T00:00:00Z",
        metadata: null,
      };
      expect(item.priority).toBe("P2");
      expect(item.status).toBe("available");
    });

    it("DbOptions fields are optional", () => {
      const opts: DbOptions = {};
      expect(opts.dbPath).toBeUndefined();
      expect(opts.envPath).toBeUndefined();
    });
  });
});
