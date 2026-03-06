import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDatabase, closeDatabase } from "../src/db";
import { resetConfigCache } from "../src/config";
import type { Database } from "bun:sqlite";

let db: Database;
let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `bb-failure-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  resetConfigCache();
  db = openDatabase(join(tmpDir, "test.db"));
  // Create a test work item to use across tests
  db.query(`
    INSERT INTO work_items (item_id, project_id, title, source, status, priority, created_at)
    VALUES ('witem-test', NULL, 'Test Item', 'local', 'available', 'P2', datetime('now'))
  `).run();
});

afterEach(() => {
  closeDatabase(db);
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("failWorkItem", () => {
  test("sets status=failed and increments failure_count", async () => {
    const { failWorkItem } = await import("../src/work");
    failWorkItem(db, "witem-test", "Something went wrong");

    const row = db.query("SELECT * FROM work_items WHERE item_id = ?").get("witem-test") as any;
    expect(row.status).toBe("failed");
    expect(row.failure_count).toBe(1);
  });

  test("sets failed_at to a non-null datetime", async () => {
    const { failWorkItem } = await import("../src/work");
    failWorkItem(db, "witem-test", "Error");

    const row = db.query("SELECT failed_at FROM work_items WHERE item_id = ?").get("witem-test") as any;
    expect(row.failed_at).not.toBeNull();
    expect(typeof row.failed_at).toBe("string");
    expect(row.failed_at.length).toBeGreaterThan(0);
  });

  test("on 3rd call auto-quarantines the item", async () => {
    const { failWorkItem } = await import("../src/work");
    failWorkItem(db, "witem-test", "Error 1");
    failWorkItem(db, "witem-test", "Error 2");
    failWorkItem(db, "witem-test", "Error 3");

    const row = db.query("SELECT * FROM work_items WHERE item_id = ?").get("witem-test") as any;
    expect(row.status).toBe("quarantined");
    expect(row.failure_count).toBe(3);
    expect(row.failure_reason).not.toBeNull();
    expect(row.failure_reason).toContain("3 times");
  });

  test("on 2nd call does NOT quarantine", async () => {
    const { failWorkItem } = await import("../src/work");
    failWorkItem(db, "witem-test", "Error 1");
    failWorkItem(db, "witem-test", "Error 2");

    const row = db.query("SELECT * FROM work_items WHERE item_id = ?").get("witem-test") as any;
    expect(row.status).toBe("failed");
    expect(row.failure_count).toBe(2);
    expect(row.failure_reason).toBe("Error 2");
  });

  test("on non-existent item is a no-op (no throw)", async () => {
    const { failWorkItem } = await import("../src/work");
    // Should not throw even if item doesn't exist
    expect(() => failWorkItem(db, "witem-nonexistent", "Error")).not.toThrow();
  });
});

describe("quarantineWorkItem", () => {
  test("sets status=quarantined and failure_reason", async () => {
    const { quarantineWorkItem } = await import("../src/work");
    quarantineWorkItem(db, "witem-test", "Too many failures");

    const row = db.query("SELECT * FROM work_items WHERE item_id = ?").get("witem-test") as any;
    expect(row.status).toBe("quarantined");
    expect(row.failure_reason).toBe("Too many failures");
  });

  test("emits work_quarantined event", async () => {
    const { quarantineWorkItem } = await import("../src/work");
    quarantineWorkItem(db, "witem-test", "Quarantine reason");

    const event = db.query(
      "SELECT * FROM events WHERE target_id = ? AND event_type = 'work_quarantined'"
    ).get("witem-test") as any;
    expect(event).not.toBeNull();
    expect(event.summary).toContain("witem-test");
  });
});

describe("getFailedItems", () => {
  test("returns only failed and quarantined items", async () => {
    const { getFailedItems } = await import("../src/work");

    // Add a second item to remain available
    db.query(`
      INSERT INTO work_items (item_id, project_id, title, source, status, priority, created_at)
      VALUES ('witem-ok', NULL, 'OK Item', 'local', 'available', 'P2', datetime('now'))
    `).run();

    // Mark test item as failed
    db.query(
      "UPDATE work_items SET status = 'failed', failed_at = datetime('now') WHERE item_id = 'witem-test'"
    ).run();

    const failed = getFailedItems(db);
    expect(failed.length).toBe(1);
    expect(failed[0].item_id).toBe("witem-test");
  });

  test("excludes pending and completed items", async () => {
    const { getFailedItems } = await import("../src/work");

    // Add completed item
    db.query(`
      INSERT INTO work_items (item_id, project_id, title, source, status, priority, created_at)
      VALUES ('witem-done', NULL, 'Done', 'local', 'completed', 'P2', datetime('now'))
    `).run();

    const failed = getFailedItems(db);
    // witem-test is still 'available', witem-done is 'completed'
    expect(failed.length).toBe(0);
  });

  test("includes quarantined items", async () => {
    const { getFailedItems } = await import("../src/work");

    db.query(
      "UPDATE work_items SET status = 'quarantined', failure_reason = 'too many', failed_at = datetime('now') WHERE item_id = 'witem-test'"
    ).run();

    const failed = getFailedItems(db);
    expect(failed.length).toBe(1);
    expect(failed[0].status).toBe("quarantined");
  });
});

describe("listWorkItems excludes quarantined", () => {
  test("status=available does not return quarantined items", async () => {
    const { listWorkItems } = await import("../src/work");

    db.query(
      "UPDATE work_items SET status = 'quarantined' WHERE item_id = 'witem-test'"
    ).run();

    const items = listWorkItems(db, { status: "available" });
    expect(items.find((i) => i.item_id === "witem-test")).toBeUndefined();
  });

  test("default list (no opts) does not return quarantined items", async () => {
    const { listWorkItems } = await import("../src/work");

    db.query(
      "UPDATE work_items SET status = 'quarantined' WHERE item_id = 'witem-test'"
    ).run();

    const items = listWorkItems(db);
    expect(items.find((i) => i.item_id === "witem-test")).toBeUndefined();
  });
});

describe("requeueWorkItem", () => {
  test("resets status to available and clears failure fields", async () => {
    const { requeueWorkItem } = await import("../src/work");

    // Put item in quarantine first
    db.query(
      "UPDATE work_items SET status = 'quarantined', failure_count = 3, failure_reason = 'too many', failed_at = datetime('now') WHERE item_id = 'witem-test'"
    ).run();

    requeueWorkItem(db, "witem-test");

    const row = db.query("SELECT * FROM work_items WHERE item_id = ?").get("witem-test") as any;
    expect(row.status).toBe("available");
    expect(row.failure_count).toBe(0);
    expect(row.failure_reason).toBeNull();
    expect(row.failed_at).toBeNull();
  });

  test("on non-existent ID is a no-op (no throw)", async () => {
    const { requeueWorkItem } = await import("../src/work");
    expect(() => requeueWorkItem(db, "witem-nonexistent")).not.toThrow();
  });

  test("emits work_requeued event", async () => {
    const { requeueWorkItem } = await import("../src/work");
    db.query(
      "UPDATE work_items SET status = 'quarantined' WHERE item_id = 'witem-test'"
    ).run();

    requeueWorkItem(db, "witem-test");

    const event = db.query(
      "SELECT * FROM events WHERE target_id = ? AND event_type = 'work_requeued'"
    ).get("witem-test") as any;
    expect(event).not.toBeNull();
  });
});
