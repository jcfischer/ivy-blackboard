# Evaluation: Porting ivy-blackboard to Elixir

**Date**: 2026-02-13
**Conclusion**: Not recommended at this time

## Summary

Elixir/OTP's strengths (concurrency, fault tolerance, distributed systems) are a
natural fit for multi-agent coordination in theory, but ivy-blackboard's
architecture is intentionally local and simple — making a port more costly than
beneficial.

## Where Elixir Aligns

- **Fault tolerance**: OTP supervision trees match the project's resilience goals
  (stale agent detection, auto-sweep, graceful degradation).
- **Process model**: Each agent could be an Erlang process with built-in
  monitoring, replacing PID liveness checks and heartbeat polling.
- **Real-time**: Phoenix Channels/LiveView would improve the SSE-based dashboard.

## Why It Doesn't Make Sense

### SQLite is the wrong primitive for BEAM

The entire architecture uses SQLite as a shared coordination surface between
independent OS processes. In Elixir, you'd use ETS/DETS, Mnesia, or GenServer
state — making the SQLite design redundant. Porting SQLite usage faithfully
(via Exqlite) works but ignores BEAM's strengths.

### No network means no BEAM advantage

The system explicitly avoids network communication. All coordination is via local
filesystem. BEAM's primary advantage is distributed, networked, fault-tolerant
systems — overkill for a local tool.

### The project is small and focused

At ~840 lines of TypeScript with 3 dependencies, ivy-blackboard is deliberately
minimal. Elixir would add significant ceremony (mix project, OTP application
structure, supervision trees, release configuration) without proportional benefit.

### CLI ergonomics are worse in Elixir

Elixir escripts and Burrito-packaged releases have slower startup times than
Bun-compiled binaries. For a CLI invoked on every agent action, startup latency
matters.

### It would be a redesign, not a port

A faithful line-by-line port would fight the BEAM's strengths. A proper Elixir
version would replace SQLite with in-process state, replace CLI commands with a
running OTP application, and replace file-based coordination with message
passing — which is a fundamentally different system.

## When It Would Make Sense

An Elixir version would be justified if:

- **Distributed multi-machine coordination** was needed (BEAM clustering)
- Agents were **long-lived supervised processes** rather than independent OS
  processes
- The **pai-collab hub** became a networked service and shared a runtime
- The dashboard needed to handle **thousands of concurrent SSE connections**

## Recommendation

Keep ivy-blackboard in TypeScript/Bun. If Elixir is desired for the broader pai
ecosystem, consider building the **pai-collab hub** in Elixir/Phoenix while
keeping the local blackboard as the lightweight, zero-dependency coordination
layer it was designed to be.
