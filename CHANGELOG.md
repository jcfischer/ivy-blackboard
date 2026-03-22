# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **Age-aware task scoring** (#43) -- Work items now use an age-based priority boost formula to prevent indefinite starvation of lower-priority tasks. Fresh P1 tasks still rank highest, but older P2/P3 tasks gradually gain priority as they age.
  - Configurable via `scoring.priorityWeights`, `scoring.boostRatePerDay`, `scoring.maxBoost` in config
  - Default: P1=100, P2=40, P3=10 base weights; 5 points/day boost; 50 point max boost
  - New `--show-scores` flag on `work list` to display effective scores
  - Formula: `effective_score = base_weight + min(age_days * boost_rate, max_boost)`

## [0.1.0] - 2026-02-04

Initial public release.

### Added

- **Agent management** -- register, deregister, heartbeat, list agent sessions
- **Project management** -- register projects, list with enriched counts, project detail view
- **Work items** -- create, claim, release, complete, block/unblock work items with priority ordering
- **Event log** -- all state changes emit events, queryable via `observe` command
- **Stale agent detection** -- automatic PID liveness checking with `sweep` command
- **Web dashboard** -- HTTP server with REST API, SSE live updates, and HTML dashboard
- **Content filtering** -- `sanitizeText()` on all user-supplied fields
- **File permissions** -- 600 permissions on database file
- **Configuration** -- optional `blackboard.json` with Zod validation and environment variable overrides
- **JSON output** -- all commands support `--json` for machine-readable output
- **Export** -- full state snapshot as JSON
