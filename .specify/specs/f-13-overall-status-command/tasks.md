---
feature_id: "F-13"
status: "draft"
---

# Tasks: Overall Status Command

## Task 1: Core Status Function with Tests

**Implement:** `src/core/status.ts` with `getOverallStatus(db, dbPath)` function.

**Test file:** `tests/core/status.test.ts`

**Test scenarios (write first):**
1. Populated database - verify counts match expected values
2. Empty database - all counts zero, no errors
3. Database size formatting - bytes/KB/MB thresholds
4. Missing database file - returns "unknown" for size
5. Active agents filtering - only status='active' agents returned

**Implementation steps:**
1. Create test file with 5 test cases (RED phase)
2. Create `src/core/status.ts`
3. Define `OverallStatus` interface
4. Implement `getOverallStatus()`:
   - Run 5 SQL queries (agents, work, projects, events, active agents)
   - Calculate database size with fs.statSync
   - Format size (bytes/KB/MB/GB)
   - Return structured object
5. All tests GREEN

**Acceptance:**
- [ ] All 5 tests pass
- [ ] Function returns correct structure
- [ ] Database size calculated and formatted
- [ ] Works on empty database without errors

---

## Task 2: Wire to CLI Command

**Update:** `src/commands/status.ts` to use `getOverallStatus()`.

**Changes:**
1. Import `getOverallStatus` from `../core/status`
2. Replace inline queries with function call: `const status = getOverallStatus(db, ctx.dbPath)`
3. Add database size to human output format
4. Update variable references to use `status.*` instead of `data.*`

**Human output format (add size):**
```
Local Blackboard Status
Database: /path/to/db (42.3 KB)

Agents:    ...
```

**JSON output:**
Already using `formatJson()` which will automatically include database_size field.

**Manual verification:**
```bash
cd /Users/fischer/work/ivy-blackboard
bun run src/index.ts status
bun run src/index.ts status --json
```

**Acceptance:**
- [ ] Command runs without errors
- [ ] Human output shows database size
- [ ] JSON output includes database_size field
- [ ] Active agents table displays correctly
- [ ] All 163+ existing tests still pass

---

## Notes

- Task 1 is TDD (tests before implementation)
- Task 2 is refactoring (existing behavior + new field)
- Database size is the only missing piece from current implementation
- Total estimated time: 30-45 minutes
