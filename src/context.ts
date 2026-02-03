import { Database } from "bun:sqlite";
import { resolveDbPath, openDatabase, closeDatabase } from "./db";
import { sweepStaleAgents } from "./sweep";

export interface GlobalOptions {
  json: boolean;
  db?: string;
}

export interface CommandContext {
  db: Database;
  dbPath: string;
  options: GlobalOptions;
}

let cachedContext: CommandContext | null = null;
let autoSweepDisabled = false;

/**
 * Disable auto-sweep for the current process.
 * Used by the sweep command which handles its own sweep.
 */
export function disableAutoSweep(): void {
  autoSweepDisabled = true;
}

/**
 * Reset context state. Used for test isolation.
 */
export function resetContextState(): void {
  cachedContext = null;
  autoSweepDisabled = false;
}

/**
 * Create (or return cached) command context.
 * Opens the database lazily on first access.
 */
export function createContext(options: GlobalOptions): CommandContext {
  if (cachedContext) return cachedContext;

  const dbPath = resolveDbPath({ dbPath: options.db });
  const db = openDatabase(dbPath);

  // Auto-sweep stale agents (silent, fail-open)
  if (!autoSweepDisabled) {
    try {
      sweepStaleAgents(db);
    } catch {
      // Sweep failure must not prevent command execution
    }
  }

  cachedContext = { db, dbPath, options };

  // Clean up on exit
  process.on("exit", () => {
    if (cachedContext) {
      closeDatabase(cachedContext.db);
      cachedContext = null;
    }
  });

  return cachedContext;
}
