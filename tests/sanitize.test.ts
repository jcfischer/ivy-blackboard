import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDatabase, closeDatabase } from "../src/db";
import { resetConfigCache } from "../src/config";
import type { Database } from "bun:sqlite";

// T-1.1: Pure sanitizeText function
describe("sanitizeText", () => {
  test("returns empty string for null/undefined", async () => {
    const { sanitizeText } = await import("../src/sanitize");
    expect(sanitizeText(null)).toBe("");
    expect(sanitizeText(undefined)).toBe("");
  });

  test("passes normal text through unchanged", async () => {
    const { sanitizeText } = await import("../src/sanitize");
    expect(sanitizeText("Hello world")).toBe("Hello world");
  });

  test("strips fenced code blocks, keeps inner content", async () => {
    const { sanitizeText } = await import("../src/sanitize");
    const input = "Before ```js\nconst x = 1;\n``` After";
    const result = sanitizeText(input);
    expect(result).not.toContain("```");
    expect(result).toContain("const x = 1;");
    expect(result).toContain("Before");
    expect(result).toContain("After");
  });

  test("strips HTML tags, keeps inner text", async () => {
    const { sanitizeText } = await import("../src/sanitize");
    expect(sanitizeText("Hello <b>world</b>")).toBe("Hello world");
    expect(sanitizeText("<script>alert('xss')</script>")).toBe("alert('xss')");
  });

  test("strips template literal expressions", async () => {
    const { sanitizeText } = await import("../src/sanitize");
    expect(sanitizeText("Hello ${name} world")).toBe("Hello  world");
    expect(sanitizeText("${process.env.SECRET}")).toBe("");
  });

  test("truncates to maxFieldLength with ellipsis", async () => {
    const { sanitizeText } = await import("../src/sanitize");
    const long = "a".repeat(600);
    const result = sanitizeText(long, { maxFieldLength: 500, stripCodeBlocks: true, stripHtmlTags: true });
    expect(result.length).toBe(503); // 500 + "..."
    expect(result.endsWith("...")).toBe(true);
  });

  test("trims whitespace", async () => {
    const { sanitizeText } = await import("../src/sanitize");
    expect(sanitizeText("  hello  ")).toBe("hello");
  });

  test("handles nested code blocks", async () => {
    const { sanitizeText } = await import("../src/sanitize");
    const input = "```\nouter\n```\nmiddle\n```\ninner\n```";
    const result = sanitizeText(input);
    expect(result).not.toContain("```");
  });

  test("handles unclosed code blocks", async () => {
    const { sanitizeText } = await import("../src/sanitize");
    const input = "text ```unclosed code";
    const result = sanitizeText(input);
    // Should not crash, content preserved
    expect(result).toContain("text");
  });

  test("handles empty result after stripping", async () => {
    const { sanitizeText } = await import("../src/sanitize");
    expect(sanitizeText("${only_template}")).toBe("");
  });
});

// T-1.2: Config toggle tests
describe("sanitizeText config toggles", () => {
  test("stripCodeBlocks=false preserves code blocks", async () => {
    const { sanitizeText } = await import("../src/sanitize");
    const input = "Hello ```code``` world";
    const result = sanitizeText(input, { maxFieldLength: 500, stripCodeBlocks: false, stripHtmlTags: true });
    expect(result).toContain("```");
  });

  test("stripHtmlTags=false preserves HTML tags", async () => {
    const { sanitizeText } = await import("../src/sanitize");
    const result = sanitizeText("<b>bold</b>", { maxFieldLength: 500, stripCodeBlocks: true, stripHtmlTags: false });
    expect(result).toContain("<b>");
  });

  test("maxFieldLength=100 truncates correctly", async () => {
    const { sanitizeText } = await import("../src/sanitize");
    const long = "x".repeat(150);
    const result = sanitizeText(long, { maxFieldLength: 100, stripCodeBlocks: true, stripHtmlTags: true });
    expect(result.length).toBe(103);
  });

  test("all flags disabled passes text through (except template literals)", async () => {
    const { sanitizeText } = await import("../src/sanitize");
    const input = "```code``` <b>html</b> ${template}";
    const result = sanitizeText(input, { maxFieldLength: 10000, stripCodeBlocks: false, stripHtmlTags: false });
    expect(result).toContain("```code```");
    expect(result).toContain("<b>html</b>");
    expect(result).not.toContain("${template}");
  });
});

// T-2.1 & T-2.2: Integration with write operations
let db: Database;
let tmpDir: string;

describe("sanitizeText integration", () => {
  beforeEach(() => {
    tmpDir = join(tmpdir(), `bb-sanitize-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    const dbPath = join(tmpDir, "test.db");
    resetConfigCache();
    db = openDatabase(dbPath);
  });

  afterEach(() => {
    closeDatabase(db);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("registerAgent sanitizes name with code blocks", async () => {
    const { registerAgent } = await import("../src/agent");
    const result = registerAgent(db, { name: "Test ```\nsome code\n``` Agent" });

    const row = db.query("SELECT agent_name FROM agents WHERE session_id = ?")
      .get(result.session_id) as any;
    expect(row.agent_name).not.toContain("```");
    expect(row.agent_name).toContain("some code");
    expect(row.agent_name).toContain("Agent");
  });

  test("registerAgent sanitizes name with HTML", async () => {
    const { registerAgent } = await import("../src/agent");
    const result = registerAgent(db, { name: "<script>alert</script> Agent" });

    const row = db.query("SELECT agent_name FROM agents WHERE session_id = ?")
      .get(result.session_id) as any;
    expect(row.agent_name).not.toContain("<script>");
    expect(row.agent_name).toContain("alert");
  });

  test("registerProject sanitizes name with HTML", async () => {
    const { registerProject } = await import("../src/project");
    const result = registerProject(db, { id: "proj-1", name: "<b>Project</b>" });

    const row = db.query("SELECT display_name FROM projects WHERE project_id = ?")
      .get("proj-1") as any;
    expect(row.display_name).not.toContain("<b>");
    expect(row.display_name).toContain("Project");
  });

  test("sendHeartbeat sanitizes progress", async () => {
    const { registerAgent, sendHeartbeat } = await import("../src/agent");
    const agent = registerAgent(db, { name: "Worker" });
    sendHeartbeat(db, { sessionId: agent.session_id, progress: "Working on ${process.env.SECRET}" });

    const hb = db.query("SELECT progress FROM heartbeats WHERE session_id = ?")
      .get(agent.session_id) as any;
    expect(hb.progress).not.toContain("${");
  });

  test("createWorkItem sanitizes title and description", async () => {
    const { createWorkItem } = await import("../src/work");
    createWorkItem(db, {
      id: "san-item",
      title: "<script>XSS</script> Task",
      description: "```rm -rf /```\nDo the thing ${env.SECRET}",
    });

    const row = db.query("SELECT title, description FROM work_items WHERE item_id = ?")
      .get("san-item") as any;
    expect(row.title).not.toContain("<script>");
    expect(row.description).not.toContain("```");
    expect(row.description).not.toContain("${");
  });
});
