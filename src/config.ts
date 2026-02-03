import { z } from "zod";
import { existsSync, readFileSync } from "node:fs";

/**
 * Zod schema for blackboard configuration with all defaults.
 * Parsing an empty object produces a fully populated config.
 */
export const BlackboardConfigSchema = z.object({
  schemaVersion: z.number().default(1),

  database: z
    .object({
      operatorPath: z.string().default("~/.pai/blackboard/local.db"),
      projectDir: z.string().default(".blackboard"),
    })
    .default({ operatorPath: "~/.pai/blackboard/local.db", projectDir: ".blackboard" }),

  heartbeat: z
    .object({
      intervalSeconds: z.number().default(60),
      staleThresholdSeconds: z.number().default(300),
    })
    .default({ intervalSeconds: 60, staleThresholdSeconds: 300 }),

  sweep: z
    .object({
      pruneHeartbeatsAfterDays: z.number().default(7),
      pruneEventsAfterDays: z.number().default(30),
      pruneCompletedAgentsAfterDays: z.number().default(1),
    })
    .default({
      pruneHeartbeatsAfterDays: 7,
      pruneEventsAfterDays: 30,
      pruneCompletedAgentsAfterDays: 1,
    }),

  webServer: z
    .object({
      port: z.number().default(3141),
      host: z.string().default("127.0.0.1"),
    })
    .default({ port: 3141, host: "127.0.0.1" }),

  contentFilter: z
    .object({
      maxFieldLength: z.number().default(500),
      stripCodeBlocks: z.boolean().default(true),
      stripHtmlTags: z.boolean().default(true),
    })
    .default({ maxFieldLength: 500, stripCodeBlocks: true, stripHtmlTags: true }),
});

/** Fully resolved configuration type. */
export type BlackboardConfig = z.infer<typeof BlackboardConfigSchema>;

/**
 * Load raw config from a JSON file.
 * Returns {} if file doesn't exist. Throws on invalid JSON.
 */
export function loadConfigFromFile(configPath: string): Record<string, unknown> {
  if (!existsSync(configPath)) {
    return {};
  }

  const raw = readFileSync(configPath, "utf-8");
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(
      `Invalid JSON in config file ${configPath}: ${(e as Error).message}`
    );
  }
}

/**
 * Environment variable to config path mapping.
 */
const ENV_MAP: Array<{
  env: string;
  section: string;
  field: string;
}> = [
  { env: "BLACKBOARD_HEARTBEAT_INTERVAL", section: "heartbeat", field: "intervalSeconds" },
  { env: "BLACKBOARD_STALE_THRESHOLD", section: "heartbeat", field: "staleThresholdSeconds" },
  { env: "BLACKBOARD_PRUNE_AFTER", section: "sweep", field: "pruneHeartbeatsAfterDays" },
  { env: "BLACKBOARD_PORT", section: "webServer", field: "port" },
];

/**
 * Apply environment variable overrides to a partial config.
 * Numeric env vars are parsed as integers. Invalid values are warned and ignored.
 */
export function applyEnvOverrides(
  config: Record<string, any>
): Record<string, any> {
  const result = { ...config };

  for (const { env, section, field } of ENV_MAP) {
    const value = process.env[env];
    if (value === undefined) continue;

    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
      console.warn(
        `Warning: invalid value for ${env}="${value}" (expected integer), ignoring`
      );
      continue;
    }

    if (!result[section]) {
      result[section] = {};
    } else {
      result[section] = { ...result[section] };
    }
    result[section][field] = parsed;
  }

  return result;
}

/** Cached config instance. */
let cachedConfig: BlackboardConfig | null = null;

/**
 * Load, validate, and cache the blackboard configuration.
 * Priority: defaults < config file < environment variables.
 *
 * @param configPath - Path to config.json (default: ~/.pai/blackboard/config.json)
 */
export function loadConfig(configPath?: string): BlackboardConfig {
  if (cachedConfig) return cachedConfig;

  const path =
    configPath ??
    `${process.env.HOME ?? require("node:os").homedir()}/.pai/blackboard/config.json`;

  // Load from file (or empty if missing)
  const fileConfig = loadConfigFromFile(path);

  // Apply env overrides
  const merged = applyEnvOverrides(fileConfig);

  // Validate through Zod (applies defaults)
  const result = BlackboardConfigSchema.parse(merged);

  cachedConfig = result;
  return result;
}

/**
 * Reset the config cache. Used for test isolation.
 */
export function resetConfigCache(): void {
  cachedConfig = null;
}
