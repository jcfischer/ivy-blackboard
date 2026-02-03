# Documentation: F-15 File Permissions Enforcement

## Files Created

| File | Purpose |
|------|---------|
| `src/permissions.ts` | Permission setting, validation, and platform detection |

## Files Modified

| File | Change |
|------|--------|
| `src/db.ts` | Calls validatePermissions before open, setSecurePermissions after create |

## API Reference

### `setSecurePermissions(dbPath): void`
Sets chmod 0600 on .db, .db-wal, .db-shm files and 0700 on containing directory. No-op on Windows. Non-fatal on chmod failure.

### `validatePermissions(dbPath): void`
Validates file permissions. Throws on world-readable (o+r) with fix command. Warns on group-readable (g+r). Silent on owner-only. No-op on Windows or missing file.

### `isPosixPlatform(): boolean`
Returns true on macOS/Linux, false on Windows.
