---
id: "F-14"
feature: "Content filtering on text fields"
status: "draft"
created: "2026-02-03"
---

# Specification: Content Filtering on Text Fields

## Overview

Implement `sanitizeText` utility that strips code blocks, HTML tags, and template literals from text fields, and enforces a configurable max length. Applied as defense-in-depth against prompt injection between agents sharing the blackboard. Uses config values from `contentFilter` section.

## User Scenarios

### Scenario 1: Strip dangerous content from agent progress

**As a** PAI system protecting agents from injection
**I want to** sanitize text written to the blackboard
**So that** malicious content in one agent's output can't inject into another's context

**Acceptance Criteria:**
- [ ] Code blocks (triple backticks) stripped from progress/work text
- [ ] HTML tags stripped (e.g., `<script>`, `<img onerror>`)
- [ ] Template literals (`${...}`) stripped
- [ ] Applied automatically on all write operations
- [ ] Original meaning preserved where possible (content inside blocks kept, wrappers removed)

### Scenario 2: Enforce field length limits

**As a** PAI operator preventing oversized entries
**I want to** enforce maximum field lengths
**So that** the database and displays remain manageable

**Acceptance Criteria:**
- [ ] Text truncated to `contentFilter.maxFieldLength` (default 500) with "..." suffix
- [ ] Truncation happens after stripping
- [ ] Config value respected from blackboard.config.json

### Scenario 3: Configurable filtering

**As a** PAI operator customizing filtering rules
**I want to** control which filters are active
**So that** I can adjust for different environments

**Acceptance Criteria:**
- [ ] `contentFilter.stripCodeBlocks` toggles code block stripping (default true)
- [ ] `contentFilter.stripHtmlTags` toggles HTML tag stripping (default true)
- [ ] `contentFilter.maxFieldLength` sets max length (default 500)
- [ ] All defaults are safe (stripping enabled)

## Functional Requirements

### FR-1: sanitizeText function

Create `sanitizeText(text: string, config?: ContentFilterConfig): string` that:
1. If stripCodeBlocks: remove triple-backtick fenced code blocks (keep inner text)
2. If stripHtmlTags: remove all HTML tags (keep inner text)
3. Remove template literal expressions `${...}` (replace with content or empty)
4. Truncate to maxFieldLength with "..." if over limit
5. Trim whitespace

**Edge cases:**
- Null/undefined input: return empty string
- Empty string after stripping: return empty string (not an error)
- Nested code blocks: strip outermost, inner content preserved
- Unclosed code blocks: strip opening fence, preserve remainder
- Normal text without any patterns: returned unchanged

**Validation:** Pass various injection strings, verify cleaned output. Verify normal text passes through unmodified.

### FR-2: Apply to all write operations

Call sanitizeText on these fields at write time:
- `registerAgent`: name, work
- `sendHeartbeat`: progress
- `registerProject`: name
- Work item create (F-8): title, description
- Event summaries (all emit points)

**Validation:** Register agent with code block in name, verify stored text is clean.

### FR-3: Config-driven behavior

Read from `loadConfig().contentFilter`. Pass config to sanitizeText. Respect toggle flags.

**Validation:** Set stripCodeBlocks=false in config, verify code blocks preserved.

## Non-Functional Requirements

- **Performance:** Sanitization under 1ms per call
- **Safety:** Defaults are restrictive (strip everything)
- **Transparency:** No silent data loss beyond documented stripping

## Key Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| ContentFilterConfig | Filter settings | maxFieldLength, stripCodeBlocks, stripHtmlTags |

## Success Criteria

- [ ] Code blocks stripped (inner content preserved)
- [ ] HTML tags stripped (inner content preserved)
- [ ] Template literals stripped
- [ ] Length enforced with truncation
- [ ] Config toggles work correctly
- [ ] Applied to all write operations
- [ ] Clean text for normal input (no false positives)

## Out of Scope

- Content filtering on read operations
- Rate limiting on writes
- Allowlist/blocklist for specific patterns
- Filtering metadata JSON blobs
