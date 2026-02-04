# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-02-04

Initial public release.

### Added

- SQLite-based blackboard with schema v2 (agents, projects, work_items, heartbeats, events)
- CLI commands: `agent`, `project`, `work`, `observe`, `status`, `sweep`, `export`, `serve`
- Web dashboard with REST API and Server-Sent Events (SSE) for live updates
- Automatic stale agent detection via PID liveness checking
- Content filtering (sanitizeText) to prevent prompt injection between agents
- File permission enforcement (600) on database files
- Configurable via `blackboard.json`, environment variables, and CLI flags
- Database path resolution: CLI flag > env var > per-project > operator-wide default
- Transactional writes with automatic event emission
- JSON output mode (`--json`) for all commands
- 305 tests across 18 test files

[0.1.0]: https://github.com/jcfischer/ivy-blackboard/releases/tag/v0.1.0
