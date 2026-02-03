import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import {
  chmodSync,
  mkdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  setSecurePermissions,
  validatePermissions,
  isPosixPlatform,
} from "../src/permissions";

const TEST_DIR = join(tmpdir(), `bb-perms-test-${Date.now()}`);

describe("isPosixPlatform", () => {
  it("returns true on macOS/Linux", () => {
    // We're running on macOS/Linux in this test environment
    expect(isPosixPlatform()).toBe(process.platform !== "win32");
  });
});

describe("setSecurePermissions", () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("sets database file to 0600", () => {
    const dbPath = join(TEST_DIR, "test.db");
    writeFileSync(dbPath, "");
    chmodSync(dbPath, 0o644); // start with open permissions

    setSecurePermissions(dbPath);

    const mode = statSync(dbPath).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("sets WAL file to 0600 if it exists", () => {
    const dbPath = join(TEST_DIR, "test.db");
    const walPath = dbPath + "-wal";
    writeFileSync(dbPath, "");
    writeFileSync(walPath, "");
    chmodSync(walPath, 0o644);

    setSecurePermissions(dbPath);

    const mode = statSync(walPath).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("sets SHM file to 0600 if it exists", () => {
    const dbPath = join(TEST_DIR, "test.db");
    const shmPath = dbPath + "-shm";
    writeFileSync(dbPath, "");
    writeFileSync(shmPath, "");
    chmodSync(shmPath, 0o644);

    setSecurePermissions(dbPath);

    const mode = statSync(shmPath).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("sets containing directory to 0700", () => {
    const subDir = join(TEST_DIR, "subdir");
    mkdirSync(subDir);
    chmodSync(subDir, 0o755);
    const dbPath = join(subDir, "test.db");
    writeFileSync(dbPath, "");

    setSecurePermissions(dbPath);

    const mode = statSync(subDir).mode & 0o777;
    expect(mode).toBe(0o700);
  });

  it("does not error when WAL/SHM files are missing", () => {
    const dbPath = join(TEST_DIR, "test.db");
    writeFileSync(dbPath, "");

    expect(() => setSecurePermissions(dbPath)).not.toThrow();
  });
});

describe("validatePermissions", () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("passes silently for 0600 permissions", () => {
    const dbPath = join(TEST_DIR, "test.db");
    writeFileSync(dbPath, "");
    chmodSync(dbPath, 0o600);

    expect(() => validatePermissions(dbPath)).not.toThrow();
  });

  it("throws for world-readable permissions", () => {
    const dbPath = join(TEST_DIR, "test.db");
    writeFileSync(dbPath, "");
    chmodSync(dbPath, 0o604);

    expect(() => validatePermissions(dbPath)).toThrow(/world-readable/);
  });

  it("error message includes fix command", () => {
    const dbPath = join(TEST_DIR, "test.db");
    writeFileSync(dbPath, "");
    chmodSync(dbPath, 0o644);

    try {
      validatePermissions(dbPath);
      expect(true).toBe(false); // should not reach
    } catch (e: any) {
      expect(e.message).toContain("chmod 600");
      expect(e.message).toContain(dbPath);
    }
  });

  it("warns but does not throw for group-readable permissions", () => {
    const dbPath = join(TEST_DIR, "test.db");
    writeFileSync(dbPath, "");
    chmodSync(dbPath, 0o640);

    // Should not throw
    expect(() => validatePermissions(dbPath)).not.toThrow();
  });

  it("does not throw when file does not exist", () => {
    const dbPath = join(TEST_DIR, "nonexistent.db");
    expect(() => validatePermissions(dbPath)).not.toThrow();
  });
});
