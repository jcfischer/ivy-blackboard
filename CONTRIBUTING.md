# Contributing to ivy-blackboard

Thanks for your interest in contributing! This document covers how to set up the project for development, run tests, and submit changes.

## Prerequisites

- [Bun](https://bun.sh/) v1.1 or later (runtime and test runner)
- Git

## Getting Started

```bash
# Clone the repository
git clone https://github.com/jcfischer/ivy-blackboard.git
cd ivy-blackboard

# Install dependencies
bun install

# Run the test suite
bun test

# Run the CLI in development mode
bun run src/index.ts status
```

## Project Structure

```
src/
  index.ts          # CLI entry point
  commands/         # Commander.js command definitions
  db.ts             # Database initialization and migrations
  schema.ts         # SQL schema definitions
  config.ts         # Configuration with Zod validation
  agent.ts          # Agent registration and lifecycle
  work.ts           # Work item management
  project.ts        # Project management
  events.ts         # Event logging
  sweep.ts          # Stale agent detection
  sanitize.ts       # Content filtering
  permissions.ts    # File permission enforcement
  server.ts         # Web dashboard and REST API
  web/
    dashboard.html  # Single-file web dashboard
tests/              # Test files (one per module)
```

## Running Tests

```bash
# Run all tests
bun test

# Run a specific test file
bun test tests/agent.test.ts

# Run tests matching a pattern
bun test --grep "heartbeat"
```

Tests use Bun's built-in test runner with in-memory SQLite databases. No external services or setup required.

## Making Changes

1. **Fork** the repository and create a feature branch from `main`.
2. **Write tests** for any new functionality or bug fixes.
3. **Run the full test suite** before submitting: `bun test`
4. **Keep commits focused** — one logical change per commit.
5. **Open a pull request** against `main` with a clear description of what changed and why.

## Code Style

- TypeScript with strict types
- No external linters or formatters are enforced — match the existing style
- Prefer explicit over implicit (e.g., named exports, typed parameters)
- Keep dependencies minimal — new runtime dependencies need justification

## Reporting Issues

Use [GitHub Issues](https://github.com/jcfischer/ivy-blackboard/issues) for bug reports and feature requests. Include:

- Steps to reproduce (for bugs)
- Expected vs actual behavior
- Bun version (`bun --version`)
- OS and version

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
