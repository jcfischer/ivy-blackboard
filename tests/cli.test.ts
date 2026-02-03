import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CLI = join(import.meta.dir, "..", "src", "index.ts");
const TEST_DIR = join(tmpdir(), `bb-cli-test-${Date.now()}`);

async function run(args: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const dbPath = join(TEST_DIR, "test.db");
  const proc = Bun.spawn(["bun", CLI, "--db", dbPath, ...args.split(" ").filter(Boolean)], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, BLACKBOARD_DB: undefined },
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  await proc.exited;
  return { stdout, stderr, exitCode: proc.exitCode };
}

describe("CLI", () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("--help shows all command groups", async () => {
    const { stdout } = await run("--help");
    expect(stdout).toContain("blackboard");
    expect(stdout).toContain("agent");
    expect(stdout).toContain("project");
    expect(stdout).toContain("work");
    expect(stdout).toContain("observe");
    expect(stdout).toContain("serve");
    expect(stdout).toContain("sweep");
    expect(stdout).toContain("status");
  });

  it("--version shows version", async () => {
    const { stdout } = await run("--version");
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("agent --help shows subcommands", async () => {
    const { stdout } = await run("agent --help");
    expect(stdout).toContain("register");
    expect(stdout).toContain("deregister");
    expect(stdout).toContain("heartbeat");
    expect(stdout).toContain("list");
  });

  it("project --help shows subcommands", async () => {
    const { stdout } = await run("project --help");
    expect(stdout).toContain("register");
    expect(stdout).toContain("list");
    expect(stdout).toContain("status");
  });

  it("work --help shows subcommands", async () => {
    const { stdout } = await run("work --help");
    expect(stdout).toContain("claim");
    expect(stdout).toContain("release");
    expect(stdout).toContain("complete");
    expect(stdout).toContain("list");
    expect(stdout).toContain("status");
  });

  it("status --json returns valid JSON envelope", async () => {
    const { stdout } = await run("status --json");
    const parsed = JSON.parse(stdout);
    expect(parsed.ok).toBeDefined();
    expect(parsed.timestamp).toBeDefined();
  });

  it("status shows human-readable output", async () => {
    const { stdout } = await run("status");
    expect(stdout).toContain("Blackboard");
  });
});
