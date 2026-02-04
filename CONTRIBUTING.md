# Contributing to ivy-blackboard

Thanks for your interest in contributing. This document covers the basics.

## Prerequisites

- [Bun](https://bun.sh/) (v1.1+)
- Git

## Setup

```bash
git clone https://github.com/jcfischer/ivy-blackboard.git
cd ivy-blackboard
bun install
```

## Development

```bash
# Run the CLI directly
bun run src/index.ts <command>

# Run tests
bun test

# Build a standalone binary
bun build src/index.ts --compile --outfile dist/blackboard
```

## Running Tests

The test suite uses `bun:test` with in-memory SQLite databases. Tests are self-contained and don't require any external setup.

```bash
bun test                    # Run all tests
bun test tests/agent.test.ts  # Run a specific test file
```

## Submitting Changes

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-change`)
3. Make your changes
4. Run the test suite (`bun test`)
5. Commit with a descriptive message
6. Push to your fork and open a pull request

## Pull Request Guidelines

- Keep PRs focused on a single change
- Include tests for new functionality
- Ensure all existing tests pass
- Update documentation if behavior changes

## Code Style

- TypeScript with Bun runtime
- Zod for validation
- Commander.js for CLI routing
- All user-supplied text goes through `sanitizeText()` before storage

## Reporting Issues

Open an issue on GitHub with:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Your Bun version (`bun --version`)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
