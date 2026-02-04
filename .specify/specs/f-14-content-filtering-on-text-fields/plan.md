---
feature: "Content filtering on text fields"
spec: "./spec.md"
status: "draft"
---

# Technical Plan: Content Filtering on Text Fields

## Architecture Overview

Create a new `src/sanitize.ts` module with `sanitizeText` function. Integrate into all write operations (agent.ts, project.ts, work.ts) by calling sanitizeText on text fields before DB insertion. Uses config values from `loadConfig().contentFilter`.

```
Write operations (agent.ts, project.ts, work.ts)
    |
    v
sanitizeText(text, config)
    |
    ├─ Strip code blocks (if enabled)
    ├─ Strip HTML tags (if enabled)
    ├─ Strip template literals
    ├─ Truncate to maxFieldLength
    └─ Trim whitespace
    |
    v
Database (sanitized text stored)
```

## Constitutional Compliance

- [x] **CLI-First:** No CLI changes — defense-in-depth applied transparently
- [x] **Library-First:** Pure function in sanitize.ts, no side effects
- [x] **Test-First:** TDD for sanitizeText, then integration tests
- [x] **Deterministic:** Same input + config = same output

## Data Model

No schema changes. Content filtering happens at the application layer before write.

### Config interface

```typescript
interface ContentFilterConfig {
  maxFieldLength: number;     // default 500
  stripCodeBlocks: boolean;   // default true
  stripHtmlTags: boolean;     // default true
}
```

Already defined in the Zod config schema (F-20).

## API Contracts

```typescript
function sanitizeText(text: string | null | undefined, config?: ContentFilterConfig): string;
```

Returns sanitized string. Null/undefined returns empty string.

## Implementation Strategy

### Phase 1: sanitizeText pure function
- Handle null/undefined → empty string
- Strip fenced code blocks: `/```[\s\S]*?```/g` → extract inner content
- Strip HTML tags: `/<[^>]+>/g` → keep inner text
- Strip template literals: `/\$\{[^}]*\}/g` → remove
- Truncate to maxFieldLength with "..." suffix
- Trim whitespace
- Config toggles control code blocks and HTML stripping
- All enabled by default

### Phase 2: Integrate into write operations
- `agent.ts`: sanitize name, work in registerAgent; progress in sendHeartbeat
- `project.ts`: sanitize name in registerProject
- `work.ts` (F-8): sanitize title, description in createWorkItem
- Event summaries: sanitize summary in all event INSERT calls

### Phase 3: Config integration
- Read from loadConfig().contentFilter
- Pass config to sanitizeText at each call site
- Respect toggle flags

## File Structure

```
src/
├── sanitize.ts         # [New] sanitizeText function
├── agent.ts            # [Modify] Apply sanitizeText to write fields
├── project.ts          # [Modify] Apply sanitizeText to write fields

tests/
├── sanitize.test.ts    # [New] Pure function tests
├── agent.test.ts       # [Modify] Integration tests (optional)
```

## Dependencies

### Internal
- F-20: Config schema (contentFilter section)
- F-3: agent.ts (write points to modify)
- F-7: project.ts (write points to modify)

## Failure Mode Analysis

| Failure | Impact | Mitigation |
|---------|--------|------------|
| Regex catastrophic backtracking | Slow sanitization | Use non-greedy quantifiers, test with adversarial input |
| Over-aggressive stripping | Data loss | Preserve inner content of stripped elements |
| Config not loaded | No filtering applied | Default config is restrictive (all stripping on) |

## Estimated Complexity

- **New files:** 1 (sanitize.ts)
- **Modified files:** 2 (agent.ts, project.ts)
- **Test files:** 1 (new)
- **Estimated tasks:** 4
