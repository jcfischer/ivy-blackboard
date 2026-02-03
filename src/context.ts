import { Database } from "bun:sqlite";
import { resolveDbPath, openDatabase, closeDatabase } from "./db";

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

/**
 * Create (or return cached) command context.
 * Opens the database lazily on first access.
 */
export function createContext(options: GlobalOptions): CommandContext {
  if (cachedContext) return cachedContext;

  const dbPath = resolveDbPath({ dbPath: options.db });
  const db = openDatabase(dbPath);

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
