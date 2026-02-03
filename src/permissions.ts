import { chmodSync, existsSync, statSync } from "node:fs";
import { dirname } from "node:path";

const FILE_MODE = 0o600;
const DIR_MODE = 0o700;

/**
 * Check if the current platform supports POSIX permissions.
 */
export function isPosixPlatform(): boolean {
  return process.platform !== "win32";
}

/**
 * Set restrictive permissions on database files and directory.
 * - .db, .db-wal, .db-shm → 0600 (owner read/write only)
 * - Containing directory → 0700 (owner access only)
 *
 * Non-fatal: logs warning if chmod fails.
 * No-op on non-POSIX platforms.
 */
export function setSecurePermissions(dbPath: string): void {
  if (!isPosixPlatform()) return;

  // Set permissions on the database file and its companions
  const files = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];

  for (const file of files) {
    if (existsSync(file)) {
      try {
        chmodSync(file, FILE_MODE);
      } catch (err) {
        console.warn(
          `Warning: could not set permissions on ${file}: ${(err as Error).message}`
        );
      }
    }
  }

  // Set permissions on containing directory
  const dir = dirname(dbPath);
  try {
    chmodSync(dir, DIR_MODE);
  } catch (err) {
    console.warn(
      `Warning: could not set directory permissions on ${dir}: ${(err as Error).message}`
    );
  }
}

/**
 * Validate permissions on an existing database file.
 * - World-readable (o+r): throws error with fix command
 * - Group-readable (g+r): warns but continues
 * - Owner-only: silent pass
 *
 * No-op on non-POSIX platforms or if file doesn't exist.
 */
export function validatePermissions(dbPath: string): void {
  if (!isPosixPlatform()) return;
  if (!existsSync(dbPath)) return;

  let mode: number;
  try {
    mode = statSync(dbPath).mode & 0o777;
  } catch {
    // stat failed (file deleted between check and open) — non-fatal
    return;
  }

  // Check world-readable (other-read bit)
  if (mode & 0o004) {
    throw new Error(
      `Blackboard database is world-readable (mode ${mode.toString(8)}): ${dbPath}\n` +
        `Fix: chmod 600 ${dbPath}`
    );
  }

  // Check group-readable (group-read bit)
  if (mode & 0o040) {
    console.warn(
      `Warning: blackboard database is group-readable (mode ${mode.toString(8)}): ${dbPath}\n` +
        `Consider: chmod 600 ${dbPath}`
    );
  }
}
