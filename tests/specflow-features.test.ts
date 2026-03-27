import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDatabase, closeDatabase } from "../src/db";
import { resetConfigCache } from "../src/config";
import {
  createFeature,
  getFeature,
  updateFeature,
  listFeatures,
  getActionableFeatures,
  checkFeatureDependenciesComplete,
  unblockDependentFeatures,
} from "../src/specflow-features";
import type { Database } from "bun:sqlite";

let db: Database;
let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `bb-specflow-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  resetConfigCache();
  db = openDatabase(join(tmpDir, "test.db"));
});

afterEach(() => {
  closeDatabase(db);
  rmSync(tmpDir, { recursive: true, force: true });
});

// ─── createFeature ────────────────────────────────────────────────────────────

describe("createFeature", () => {
  test("creates a feature with required fields only", () => {
    const feature = createFeature(db, {
      feature_id: "F-027",
      project_id: "proj-1",
      title: "SpecFlow State Machine Redesign",
    });

    expect(feature.feature_id).toBe("F-027");
    expect(feature.project_id).toBe("proj-1");
    expect(feature.title).toBe("SpecFlow State Machine Redesign");
    expect(feature.phase).toBe("queued");
    expect(feature.status).toBe("pending");
    expect(feature.main_branch).toBe("main");
    expect(feature.max_failures).toBe(3);
    expect(feature.failure_count).toBe(0);
    expect(feature.source).toBe("specflow");
    expect(feature.created_at).toBeTruthy();
    expect(feature.updated_at).toBeTruthy();
    expect(feature.description).toBeNull();
    expect(feature.current_session).toBeNull();
    expect(feature.worktree_path).toBeNull();
    expect(feature.branch_name).toBeNull();
    expect(feature.last_error).toBeNull();
    expect(feature.pr_url).toBeNull();
    expect(feature.completed_at).toBeNull();
  });

  test("creates a feature with all optional fields", () => {
    const feature = createFeature(db, {
      feature_id: "F-028",
      project_id: "proj-1",
      title: "GitHub Integration",
      description: "Adds GitHub issue support",
      phase: "specified",
      status: "succeeded",
      main_branch: "develop",
      max_failures: 5,
      source: "github",
      source_ref: "https://github.com/org/repo/issues/42",
      github_issue_number: 42,
      github_issue_url: "https://github.com/org/repo/issues/42",
      github_repo: "org/repo",
    });

    expect(feature.feature_id).toBe("F-028");
    expect(feature.description).toBe("Adds GitHub issue support");
    expect(feature.phase).toBe("specified");
    expect(feature.status).toBe("succeeded");
    expect(feature.main_branch).toBe("develop");
    expect(feature.max_failures).toBe(5);
    expect(feature.source).toBe("github");
    expect(feature.source_ref).toBe("https://github.com/org/repo/issues/42");
    expect(feature.github_issue_number).toBe(42);
    expect(feature.github_issue_url).toBe("https://github.com/org/repo/issues/42");
    expect(feature.github_repo).toBe("org/repo");
  });

  test("throws FEATURE_EXISTS on duplicate feature_id", () => {
    createFeature(db, { feature_id: "F-027", project_id: "p1", title: "First" });
    expect(() =>
      createFeature(db, { feature_id: "F-027", project_id: "p1", title: "Second" })
    ).toThrow("SpecFlow feature already exists: F-027");
  });

  test("feature row is persisted to database", () => {
    createFeature(db, { feature_id: "F-029", project_id: "p1", title: "Persist test" });
    const row = db.query("SELECT * FROM specflow_features WHERE feature_id = ?").get("F-029") as any;
    expect(row).not.toBeNull();
    expect(row.title).toBe("Persist test");
  });
});

// ─── getFeature ───────────────────────────────────────────────────────────────

describe("getFeature", () => {
  test("returns feature by ID", () => {
    createFeature(db, { feature_id: "F-030", project_id: "p1", title: "Get test" });
    const feature = getFeature(db, "F-030");
    expect(feature).not.toBeNull();
    expect(feature!.feature_id).toBe("F-030");
    expect(feature!.title).toBe("Get test");
  });

  test("returns null for unknown feature_id", () => {
    const result = getFeature(db, "DOES-NOT-EXIST");
    expect(result).toBeNull();
  });
});

// ─── updateFeature ────────────────────────────────────────────────────────────

describe("updateFeature", () => {
  test("updates phase and status", () => {
    createFeature(db, { feature_id: "F-031", project_id: "p1", title: "Update test" });
    const updated = updateFeature(db, "F-031", { phase: "specifying", status: "active" });
    expect(updated.phase).toBe("specifying");
    expect(updated.status).toBe("active");
  });

  test("always updates updated_at", async () => {
    createFeature(db, { feature_id: "F-032", project_id: "p1", title: "Timestamp test" });
    const before = getFeature(db, "F-032")!.updated_at;
    // Small delay to ensure timestamp changes
    await new Promise((resolve) => setTimeout(resolve, 5));
    updateFeature(db, "F-032", { phase: "specifying" });
    const after = getFeature(db, "F-032")!.updated_at;
    expect(after >= before).toBe(true);
  });

  test("updates multiple fields at once", () => {
    createFeature(db, { feature_id: "F-033", project_id: "p1", title: "Multi update" });
    const updated = updateFeature(db, "F-033", {
      phase: "implementing",
      status: "active",
      current_session: "session-abc",
      worktree_path: "/tmp/worktree-F-033",
      branch_name: "specflow-F-033",
      failure_count: 1,
    });
    expect(updated.phase).toBe("implementing");
    expect(updated.status).toBe("active");
    expect(updated.current_session).toBe("session-abc");
    expect(updated.worktree_path).toBe("/tmp/worktree-F-033");
    expect(updated.branch_name).toBe("specflow-F-033");
    expect(updated.failure_count).toBe(1);
  });

  test("can set nullable fields to null", () => {
    createFeature(db, {
      feature_id: "F-034",
      project_id: "p1",
      title: "Null test",
      description: "Some description",
    });
    updateFeature(db, "F-034", { current_session: "s1" });
    const withSession = getFeature(db, "F-034")!;
    expect(withSession.current_session).toBe("s1");

    updateFeature(db, "F-034", { current_session: null });
    const cleared = getFeature(db, "F-034")!;
    expect(cleared.current_session).toBeNull();
  });

  test("stores eval scores", () => {
    createFeature(db, { feature_id: "F-035", project_id: "p1", title: "Score test" });
    updateFeature(db, "F-035", { specify_score: 92, plan_score: 88 });
    const feature = getFeature(db, "F-035")!;
    expect(feature.specify_score).toBe(92);
    expect(feature.plan_score).toBe(88);
  });

  test("throws FEATURE_NOT_FOUND for unknown ID", () => {
    expect(() => updateFeature(db, "GHOST", { phase: "specified" })).toThrow(
      "SpecFlow feature not found: GHOST"
    );
  });

  test("can store PR info", () => {
    createFeature(db, { feature_id: "F-036", project_id: "p1", title: "PR test" });
    updateFeature(db, "F-036", {
      pr_number: 42,
      pr_url: "https://github.com/org/repo/pull/42",
      commit_sha: "abc123def",
      phase: "completed",
      status: "succeeded",
      completed_at: new Date().toISOString(),
    });
    const feature = getFeature(db, "F-036")!;
    expect(feature.pr_number).toBe(42);
    expect(feature.pr_url).toBe("https://github.com/org/repo/pull/42");
    expect(feature.commit_sha).toBe("abc123def");
    expect(feature.completed_at).toBeTruthy();
  });
});

// ─── listFeatures ─────────────────────────────────────────────────────────────

describe("listFeatures", () => {
  beforeEach(() => {
    createFeature(db, { feature_id: "F-A1", project_id: "proj-alpha", title: "Alpha 1", phase: "queued", status: "pending" });
    createFeature(db, { feature_id: "F-A2", project_id: "proj-alpha", title: "Alpha 2", phase: "specifying", status: "active" });
    createFeature(db, { feature_id: "F-B1", project_id: "proj-beta",  title: "Beta 1",  phase: "implemented", status: "succeeded" });
  });

  test("returns all features when no filters", () => {
    const all = listFeatures(db);
    expect(all.length).toBe(3);
  });

  test("filters by project_id", () => {
    const alpha = listFeatures(db, { projectId: "proj-alpha" });
    expect(alpha.length).toBe(2);
    expect(alpha.every((f) => f.project_id === "proj-alpha")).toBe(true);
  });

  test("filters by phase", () => {
    const specifying = listFeatures(db, { phase: "specifying" });
    expect(specifying.length).toBe(1);
    expect(specifying[0].feature_id).toBe("F-A2");
  });

  test("filters by status", () => {
    const active = listFeatures(db, { status: "active" });
    expect(active.length).toBe(1);
    expect(active[0].status).toBe("active");
  });

  test("combines multiple filters", () => {
    const result = listFeatures(db, { projectId: "proj-alpha", status: "pending" });
    expect(result.length).toBe(1);
    expect(result[0].feature_id).toBe("F-A1");
  });

  test("returns empty array when nothing matches", () => {
    const result = listFeatures(db, { phase: "completed" });
    expect(result).toEqual([]);
  });
});

// ─── getActionableFeatures ────────────────────────────────────────────────────

describe("getActionableFeatures", () => {
  test("returns pending features up to maxConcurrent", () => {
    createFeature(db, { feature_id: "F-P1", project_id: "p1", title: "Pending 1", status: "pending", phase: "queued" });
    createFeature(db, { feature_id: "F-P2", project_id: "p1", title: "Pending 2", status: "pending", phase: "queued" });
    createFeature(db, { feature_id: "F-P3", project_id: "p1", title: "Pending 3", status: "pending", phase: "queued" });

    const result = getActionableFeatures(db, 2);
    // maxConcurrent=2, no active → 2 pending slots
    const pending = result.filter((f) => f.status === "pending");
    expect(pending.length).toBe(2);
  });

  test("always returns active features regardless of limit", () => {
    for (let i = 1; i <= 3; i++) {
      createFeature(db, {
        feature_id: `F-ACT-${i}`,
        project_id: "p1",
        title: `Active ${i}`,
        status: "active",
        phase: "implementing",
      });
    }

    const result = getActionableFeatures(db, 2);
    const active = result.filter((f) => f.status === "active");
    expect(active.length).toBe(3); // all 3, even though limit is 2
  });

  test("excludes completed and blocked features", () => {
    createFeature(db, { feature_id: "F-DONE", project_id: "p1", title: "Done", status: "succeeded", phase: "completed" });
    createFeature(db, { feature_id: "F-BLOCK", project_id: "p1", title: "Blocked", status: "blocked", phase: "blocked" });
    createFeature(db, { feature_id: "F-PEND", project_id: "p1", title: "Pending", status: "pending", phase: "queued" });

    const result = getActionableFeatures(db, 4);
    const ids = result.map((f) => f.feature_id);
    expect(ids).not.toContain("F-DONE");
    expect(ids).not.toContain("F-BLOCK");
    expect(ids).toContain("F-PEND");
  });

  test("includes over-limit features for failure marking", () => {
    createFeature(db, {
      feature_id: "F-OVER",
      project_id: "p1",
      title: "Over limit",
      status: "pending",
      phase: "queued",
    });
    updateFeature(db, "F-OVER", { failure_count: 3, max_failures: 3 }); // at limit

    const result = getActionableFeatures(db, 4);
    const over = result.find((f) => f.feature_id === "F-OVER");
    expect(over).toBeDefined();
  });

  test("returns empty when no actionable features", () => {
    createFeature(db, { feature_id: "F-C1", project_id: "p1", title: "Completed", status: "succeeded", phase: "completed" });
    const result = getActionableFeatures(db, 4);
    expect(result.length).toBe(0);
  });
});

// ─── Feature dependency tracking ──────────────────────────────────────────────

describe("checkFeatureDependenciesComplete", () => {
  test("returns true when depends_on is null", () => {
    expect(checkFeatureDependenciesComplete(db, "F-X", null)).toBe(true);
  });

  test("returns true when all dependencies are completed", () => {
    createFeature(db, { feature_id: "F-D1", project_id: "p1", title: "Done", phase: "completed" });
    expect(checkFeatureDependenciesComplete(db, "F-X", "F-D1")).toBe(true);
  });

  test("returns false when a dependency is not completed", () => {
    createFeature(db, { feature_id: "F-D2", project_id: "p1", title: "In progress", phase: "implementing" });
    expect(checkFeatureDependenciesComplete(db, "F-X", "F-D2")).toBe(false);
  });

  test("returns false when a dependency does not exist", () => {
    expect(checkFeatureDependenciesComplete(db, "F-X", "F-NONEXISTENT")).toBe(false);
  });

  test("handles multiple dependencies — all complete", () => {
    createFeature(db, { feature_id: "F-E1", project_id: "p1", title: "Done 1", phase: "completed" });
    createFeature(db, { feature_id: "F-E2", project_id: "p1", title: "Done 2", phase: "completed" });
    expect(checkFeatureDependenciesComplete(db, "F-X", "F-E1,F-E2")).toBe(true);
  });

  test("handles multiple dependencies — one incomplete", () => {
    createFeature(db, { feature_id: "F-F1", project_id: "p1", title: "Done", phase: "completed" });
    createFeature(db, { feature_id: "F-F2", project_id: "p1", title: "In progress", phase: "tasked" });
    expect(checkFeatureDependenciesComplete(db, "F-X", "F-F1,F-F2")).toBe(false);
  });

  test("parses cross-project projectId:featureId format", () => {
    createFeature(db, { feature_id: "F-G1", project_id: "other-project", title: "Done", phase: "completed" });
    expect(checkFeatureDependenciesComplete(db, "F-X", "other-project:F-G1")).toBe(true);
  });
});

describe("createFeature with dependsOn", () => {
  test("starts blocked when dependency is not completed", () => {
    createFeature(db, { feature_id: "F-H1", project_id: "p1", title: "Dep" });
    const child = createFeature(db, { feature_id: "F-H2", project_id: "p1", title: "Child", dependsOn: "F-H1" });
    expect(child.status).toBe("blocked");
    expect(child.depends_on).toBe("F-H1");
  });

  test("starts pending when all dependencies are completed", () => {
    createFeature(db, { feature_id: "F-I1", project_id: "p1", title: "Dep", phase: "completed" });
    const child = createFeature(db, { feature_id: "F-I2", project_id: "p1", title: "Child", dependsOn: "F-I1" });
    expect(child.status).toBe("pending");
  });

  test("blocked features not returned by getActionableFeatures", () => {
    createFeature(db, { feature_id: "F-J1", project_id: "p1", title: "Dep" });
    createFeature(db, { feature_id: "F-J2", project_id: "p1", title: "Child", dependsOn: "F-J1" });
    const actionable = getActionableFeatures(db, 4);
    const ids = actionable.map(f => f.feature_id);
    expect(ids).toContain("F-J1");
    expect(ids).not.toContain("F-J2");
  });
});

describe("unblockDependentFeatures", () => {
  test("unblocks a feature when its dependency completes", () => {
    createFeature(db, { feature_id: "F-K1", project_id: "p1", title: "Dep" });
    createFeature(db, { feature_id: "F-K2", project_id: "p1", title: "Child", dependsOn: "F-K1" });
    expect(getFeature(db, "F-K2")!.status).toBe("blocked");

    // Complete the dependency
    updateFeature(db, "F-K1", { phase: "completed" });
    const count = unblockDependentFeatures(db, "F-K1");

    expect(count).toBe(1);
    expect(getFeature(db, "F-K2")!.status).toBe("pending");
  });

  test("does not unblock if other dependencies still incomplete", () => {
    createFeature(db, { feature_id: "F-L1", project_id: "p1", title: "Dep 1" });
    createFeature(db, { feature_id: "F-L2", project_id: "p1", title: "Dep 2" });
    createFeature(db, { feature_id: "F-L3", project_id: "p1", title: "Child", dependsOn: "F-L1,F-L2" });

    updateFeature(db, "F-L1", { phase: "completed" });
    const count = unblockDependentFeatures(db, "F-L1");

    expect(count).toBe(0);
    expect(getFeature(db, "F-L3")!.status).toBe("blocked");
  });

  test("unblocks when all dependencies complete", () => {
    createFeature(db, { feature_id: "F-M1", project_id: "p1", title: "Dep 1" });
    createFeature(db, { feature_id: "F-M2", project_id: "p1", title: "Dep 2" });
    createFeature(db, { feature_id: "F-M3", project_id: "p1", title: "Child", dependsOn: "F-M1,F-M2" });

    updateFeature(db, "F-M1", { phase: "completed" });
    unblockDependentFeatures(db, "F-M1");
    updateFeature(db, "F-M2", { phase: "completed" });
    const count = unblockDependentFeatures(db, "F-M2");

    expect(count).toBe(1);
    expect(getFeature(db, "F-M3")!.status).toBe("pending");
  });

  test("returns 0 when no features depend on completed feature", () => {
    createFeature(db, { feature_id: "F-N1", project_id: "p1", title: "Solo" });
    updateFeature(db, "F-N1", { phase: "completed" });
    expect(unblockDependentFeatures(db, "F-N1")).toBe(0);
  });
});
