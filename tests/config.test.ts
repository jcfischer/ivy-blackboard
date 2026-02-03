import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// T-1.1: Zod schema with defaults
describe("BlackboardConfigSchema", () => {
  test("parses empty object to all defaults", async () => {
    const { BlackboardConfigSchema } = await import("../src/config");
    const config = BlackboardConfigSchema.parse({});

    expect(config.schemaVersion).toBe(1);

    // database
    expect(config.database.operatorPath).toBe("~/.pai/blackboard/local.db");
    expect(config.database.projectDir).toBe(".blackboard");

    // heartbeat
    expect(config.heartbeat.intervalSeconds).toBe(60);
    expect(config.heartbeat.staleThresholdSeconds).toBe(300);

    // sweep
    expect(config.sweep.pruneHeartbeatsAfterDays).toBe(7);
    expect(config.sweep.pruneEventsAfterDays).toBe(30);
    expect(config.sweep.pruneCompletedAgentsAfterDays).toBe(1);

    // webServer
    expect(config.webServer.port).toBe(3141);
    expect(config.webServer.host).toBe("127.0.0.1");

    // contentFilter
    expect(config.contentFilter.maxFieldLength).toBe(500);
    expect(config.contentFilter.stripCodeBlocks).toBe(true);
    expect(config.contentFilter.stripHtmlTags).toBe(true);
  });

  test("accepts partial config and merges with defaults", async () => {
    const { BlackboardConfigSchema } = await import("../src/config");
    const config = BlackboardConfigSchema.parse({
      heartbeat: { intervalSeconds: 120 },
    });

    expect(config.heartbeat.intervalSeconds).toBe(120);
    expect(config.heartbeat.staleThresholdSeconds).toBe(300); // default preserved
    expect(config.database.operatorPath).toBe("~/.pai/blackboard/local.db"); // other section defaults
  });

  test("rejects invalid types", async () => {
    const { BlackboardConfigSchema } = await import("../src/config");
    expect(() =>
      BlackboardConfigSchema.parse({ heartbeat: { intervalSeconds: "not-a-number" } })
    ).toThrow();
  });

  test("infers BlackboardConfig type", async () => {
    const { BlackboardConfigSchema } = await import("../src/config");
    type Config = ReturnType<typeof BlackboardConfigSchema.parse>;
    // Type check: these should compile
    const config: Config = BlackboardConfigSchema.parse({});
    const _port: number = config.webServer.port;
    const _strip: boolean = config.contentFilter.stripCodeBlocks;
    expect(true).toBe(true);
  });
});

// T-2.1: Config file loading
describe("loadConfigFromFile", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `bb-config-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("returns empty object when file missing", async () => {
    const { loadConfigFromFile } = await import("../src/config");
    const result = loadConfigFromFile(join(tmpDir, "nonexistent.json"));
    expect(result).toEqual({});
  });

  test("parses valid JSON config", async () => {
    const { loadConfigFromFile } = await import("../src/config");
    const configPath = join(tmpDir, "config.json");
    writeFileSync(configPath, JSON.stringify({ webServer: { port: 8080 } }));

    const result = loadConfigFromFile(configPath);
    expect(result).toEqual({ webServer: { port: 8080 } });
  });

  test("throws on invalid JSON with file path in message", async () => {
    const { loadConfigFromFile } = await import("../src/config");
    const configPath = join(tmpDir, "config.json");
    writeFileSync(configPath, "{ invalid json }");

    expect(() => loadConfigFromFile(configPath)).toThrow(configPath);
  });
});

// T-2.2: Environment variable overrides
describe("applyEnvOverrides", () => {
  const envVars = [
    "BLACKBOARD_HEARTBEAT_INTERVAL",
    "BLACKBOARD_STALE_THRESHOLD",
    "BLACKBOARD_PRUNE_AFTER",
    "BLACKBOARD_PORT",
  ];

  afterEach(() => {
    for (const v of envVars) {
      delete process.env[v];
    }
  });

  test("applies numeric env overrides", async () => {
    const { applyEnvOverrides } = await import("../src/config");
    process.env.BLACKBOARD_PORT = "9999";
    process.env.BLACKBOARD_HEARTBEAT_INTERVAL = "120";

    const config = applyEnvOverrides({});
    expect(config.webServer?.port).toBe(9999);
    expect(config.heartbeat?.intervalSeconds).toBe(120);
  });

  test("applies stale threshold override", async () => {
    const { applyEnvOverrides } = await import("../src/config");
    process.env.BLACKBOARD_STALE_THRESHOLD = "600";
    const config = applyEnvOverrides({});
    expect(config.heartbeat?.staleThresholdSeconds).toBe(600);
  });

  test("applies prune override", async () => {
    const { applyEnvOverrides } = await import("../src/config");
    process.env.BLACKBOARD_PRUNE_AFTER = "14";
    const config = applyEnvOverrides({});
    expect(config.sweep?.pruneHeartbeatsAfterDays).toBe(14);
  });

  test("ignores non-numeric env values with warning", async () => {
    const { applyEnvOverrides } = await import("../src/config");
    process.env.BLACKBOARD_PORT = "not-a-number";

    // Should not throw, just warn
    const config = applyEnvOverrides({});
    expect(config.webServer?.port).toBeUndefined();
  });

  test("env overrides merge into existing config", async () => {
    const { applyEnvOverrides } = await import("../src/config");
    process.env.BLACKBOARD_PORT = "8080";

    const config = applyEnvOverrides({
      webServer: { port: 3141, host: "0.0.0.0" },
    } as any);

    expect(config.webServer?.port).toBe(8080);
    expect(config.webServer?.host).toBe("0.0.0.0"); // preserved
  });
});

// T-3.1: loadConfig with caching
describe("loadConfig", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `bb-config-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    const { resetConfigCache } = await import("../src/config");
    resetConfigCache();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.BLACKBOARD_PORT;
    delete process.env.BLACKBOARD_HEARTBEAT_INTERVAL;
    delete process.env.BLACKBOARD_STALE_THRESHOLD;
    delete process.env.BLACKBOARD_PRUNE_AFTER;
  });

  test("returns all defaults when no config file", async () => {
    const { loadConfig, resetConfigCache } = await import("../src/config");
    resetConfigCache();
    const config = loadConfig(join(tmpDir, "nonexistent.json"));

    expect(config.schemaVersion).toBe(1);
    expect(config.webServer.port).toBe(3141);
    expect(config.heartbeat.intervalSeconds).toBe(60);
  });

  test("merges partial config file with defaults", async () => {
    const { loadConfig, resetConfigCache } = await import("../src/config");
    resetConfigCache();
    const configPath = join(tmpDir, "config.json");
    writeFileSync(configPath, JSON.stringify({ webServer: { port: 8080 } }));

    const config = loadConfig(configPath);
    expect(config.webServer.port).toBe(8080);
    expect(config.webServer.host).toBe("127.0.0.1"); // default preserved
  });

  test("env overrides take precedence over file", async () => {
    const { loadConfig, resetConfigCache } = await import("../src/config");
    resetConfigCache();
    const configPath = join(tmpDir, "config.json");
    writeFileSync(configPath, JSON.stringify({ webServer: { port: 8080 } }));
    process.env.BLACKBOARD_PORT = "9999";

    const config = loadConfig(configPath);
    expect(config.webServer.port).toBe(9999);
  });

  test("caches config after first load", async () => {
    const { loadConfig, resetConfigCache } = await import("../src/config");
    resetConfigCache();
    const configPath = join(tmpDir, "config.json");
    writeFileSync(configPath, JSON.stringify({}));

    const config1 = loadConfig(configPath);
    const config2 = loadConfig(configPath);
    expect(config1).toBe(config2); // same reference
  });

  test("resetConfigCache clears cache", async () => {
    const { loadConfig, resetConfigCache } = await import("../src/config");
    resetConfigCache();
    const configPath = join(tmpDir, "config.json");
    writeFileSync(configPath, JSON.stringify({}));

    const config1 = loadConfig(configPath);
    resetConfigCache();
    const config2 = loadConfig(configPath);
    expect(config1).not.toBe(config2); // different references
    expect(config1).toEqual(config2); // same values
  });
});
