---
feature: "Content filtering on text fields"
plan: "./plan.md"
status: "pending"
total_tasks: 4
completed: 0
---

# Tasks: Content Filtering on Text Fields

## Legend

- `[T]` - Test required (TDD mandatory - write test FIRST)
- `depends: T-X.Y` - Must complete after specified task(s)

## Task Groups

### Group 1: Pure sanitizeText function

- [ ] **T-1.1** Implement sanitizeText pure function [T]
  - File: `src/sanitize.ts` (new)
  - Test: `tests/sanitize.test.ts` (new)
  - Description: Create `sanitizeText(text: string | null | undefined, config?: ContentFilterConfig): string`. Steps: (1) null/undefined → return "". (2) If stripCodeBlocks: remove triple-backtick fenced code blocks via regex, keep inner content. (3) If stripHtmlTags: remove all HTML tags via regex, keep inner text. (4) Remove template literal expressions `${...}`. (5) Truncate to maxFieldLength with "..." suffix if over. (6) Trim whitespace. Default config from loadConfig().contentFilter. Test with: code blocks, HTML tags, template literals, nested blocks, unclosed blocks, normal text (unchanged), null input, empty result after stripping.

- [ ] **T-1.2** Config toggle tests [T] (depends: T-1.1)
  - File: `src/sanitize.ts`
  - Test: `tests/sanitize.test.ts`
  - Description: Test stripCodeBlocks=false preserves code blocks. Test stripHtmlTags=false preserves HTML tags. Test maxFieldLength=100 truncates at 100+3. Test all flags disabled passes text through unchanged (except template literals which always strip).

### Group 2: Integration with write operations

- [ ] **T-2.1** Apply sanitizeText to agent.ts write operations [T] (depends: T-1.1)
  - File: `src/agent.ts` (modify)
  - Test: `tests/sanitize.test.ts`
  - Description: In registerAgent: sanitize opts.name and opts.work before insert. In sendHeartbeat: sanitize opts.progress before insert. Import sanitizeText and loadConfig. Test: register agent with `name: "Test \`\`\`code\`\`\`"`, verify stored name has code block stripped.

- [ ] **T-2.2** Apply sanitizeText to project.ts write operations [T] (depends: T-1.1)
  - File: `src/project.ts` (modify)
  - Test: `tests/sanitize.test.ts`
  - Description: In registerProject: sanitize opts.name before insert. Test: register project with HTML in name, verify stored name has tags stripped.

## Dependency Graph

```
T-1.1 ──┬──> T-1.2
         ├──> T-2.1
         └──> T-2.2
```

## Execution Order

1. **T-1.1** Core sanitizeText
2. **Parallel:** T-1.2, T-2.1, T-2.2 (after T-1.1)

## Progress Tracking

| Task | Status | Started | Completed | Notes |
|------|--------|---------|-----------|-------|
| T-1.1 | pending | - | - | |
| T-1.2 | pending | - | - | |
| T-2.1 | pending | - | - | |
| T-2.2 | pending | - | - | |

## TDD Enforcement (MANDATORY)

### Test Notes

sanitizeText is a pure function — test with direct inputs, no database needed for T-1.x. Integration tests (T-2.x) use temp databases to verify sanitized text stored correctly.
