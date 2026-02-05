# Ivy: Autonomous Agent Coordination

## The Problem

You have multiple projects. Each has features to build, bugs to fix, integrations to wire up. Today you open a terminal, pick a project, and start working. Tomorrow you pick another. The projects don't know about each other. Nothing runs while you sleep.

What if your projects could register their own work, and agents could pick it up autonomously?

## The Blackboard Pattern

The **blackboard** is a coordination pattern from AI research. Instead of agents talking directly to each other, they read from and write to a shared surface -- a blackboard. Any agent can post work. Any agent can observe what others are doing. No agent needs to know about any other agent.

This is fundamentally different from a task assignment system. Nobody assigns work. Agents are **aware** of what exists and **claim** what they can do. The blackboard is an awareness model, not an assignment model.

```
                 ┌─────────────────────────────────┐
                 │         BLACKBOARD               │
                 │  ~/.pai/blackboard/local.db      │
                 │                                   │
                 │  agents:     who is running       │
                 │  work_items: what needs doing     │
                 │  events:     what happened         │
                 │  heartbeats: who is alive          │
                 │  projects:   what exists           │
                 └──────┬──────┬──────┬──────────────┘
                        │      │      │
               ┌────────┘      │      └────────┐
               │               │               │
          ┌────▼────┐    ┌─────▼────┐    ┌─────▼────┐
          │ Agent A  │    │ Agent B  │    │ Agent C  │
          │ project-a│    │ project-b│    │ heartbeat│
          │ features │    │ features │    │ checks   │
          └──────────┘    └──────────┘    └──────────┘
```

The key properties:

- **Decoupled** -- agents don't import each other, they share a database
- **Observable** -- any agent can see what every other agent is doing
- **Resilient** -- if an agent dies, its PID stops responding, the sweep reclaims its work
- **Local** -- single SQLite file, no network, no containers, no infrastructure

## Two Components

### ivy-blackboard

The shared state layer. A SQLite database with a CLI for reading and writing.

```bash
# Register a project
blackboard project register --id my-project --name "My Project" --path ~/work/my-project

# Post work items
blackboard work create --id task-rss-retry \
  --title "Add retry logic to RSS fetcher" \
  --project my-project --priority P1

# An agent claims work
blackboard agent register --name "feature-builder" --project my-project
blackboard work claim task-rss-retry --session $SESSION_ID

# Other agents can see what's happening
blackboard status
blackboard observe --since 1h
```

The blackboard doesn't run anything. It doesn't schedule anything. It is the shared surface that makes coordination possible.

### ivy-heartbeat

The proactive lifecycle layer. It runs on a schedule (via macOS launchd), checks a configurable checklist, and acts on what it finds.

```bash
# Install the heartbeat to run every 60 minutes
ivy-heartbeat schedule install

# It reads a config for what to check:
#   - Calendar conflicts → voice alert
#   - Email backlog → terminal notification
#   - Custom checks → any evaluator you write
```

Heartbeat writes everything to the blackboard. Its checks become events. Its alerts become events. When it registers as an agent, the blackboard tracks it like any other agent.

But heartbeat's real power is that it **bridges the gap between the blackboard and time**. The blackboard knows what exists. Heartbeat knows what is due.

## Autonomous Scheduling

Here is how the two components compose into a system that develops features while you sleep.

### Step 1: Projects Register Their Work

Each project maintains a backlog of features. These get posted to the blackboard -- either manually, from a SpecFlow features.db, or from GitHub issues:

```bash
# project-a registers its upcoming features
blackboard work create --id project-a-cache \
  --title "Add semantic cache layer to database queries" \
  --project project-a --priority P2 --source local

blackboard work create --id project-a-monitoring \
  --title "Health monitoring dashboard" \
  --project project-a --priority P3 --source local

# project-b registers its features
blackboard work create --id project-b-user-mgmt \
  --title "User management with role-based access" \
  --project project-b --priority P1 --source local

blackboard work create --id project-b-audit-log \
  --title "Security audit logging for compliance" \
  --project project-b --priority P2 --source local
```

Now the blackboard knows about work across multiple projects. No project knows about the other. They just posted to the shared surface.

### Step 2: The Scheduler Picks Up Work

A scheduling agent -- which could be a heartbeat check, a cron job, or a Claude Code hook -- queries the blackboard for available work:

```bash
# What's available, ordered by priority?
blackboard work list --status available

# Output:
# ITEM                TITLE                                    STATUS     PRIORITY  PROJECT
# project-b-user-mgmt  User management with role-based access   available  P1        project-b
# project-a-cache       Add semantic cache layer to database..   available  P2        project-a
# project-b-audit-log   Security audit logging for compliance    available  P2        project-b
# project-a-monitoring  Health monitoring dashboard               available  P3        project-a
```

The scheduler sees P1 work on project-b. It launches an agent:

```bash
# Register as an agent working on project-b
SESSION=$(blackboard agent register --name "overnight-builder" \
  --project project-b --work "project-b-user-mgmt" --json | jq -r .session_id)

# Claim the work item
blackboard work claim project-b-user-mgmt --session $SESSION

# Launch Claude Code in the project directory
cd ~/work/project-b
claude --prompt "Implement user management with role-based access. \
  Use the existing auth patterns. When done, run: \
  blackboard work complete project-b-user-mgmt --session $SESSION"
```

### Step 3: Progress Is Visible

While the agent works, it sends heartbeats:

```bash
blackboard agent heartbeat --session $SESSION \
  --progress "Created migration for users table, writing seed data"
```

Any observer -- you, another agent, the web dashboard -- can see exactly what's happening:

```bash
blackboard observe --since 30m
# [2m ago]  work_claimed      [overnight-bu] Work item "project-b-user-mgmt" claimed
# [1m ago]  heartbeat_received [overnight-bu] Created migration for users table...

blackboard project status project-b
# PROJECT: Project B (project-b)
# ACTIVE AGENTS (1):
#   - overnight-builder [abc-123...] (active) — Created migration for users table
# WORK ITEMS (2):
#   Claimed (1):
#     [project-b-user-mgmt] User management with role-based access — P1
#   Available (1):
#     [project-b-audit-log] Security audit logging for compliance — P2
```

### Step 4: Completion and Handoff

When the agent finishes:

```bash
blackboard work complete project-b-user-mgmt --session $SESSION
blackboard agent deregister --session $SESSION
```

The work item moves to `completed`. The agent is deregistered. The scheduler can now pick up the next item -- maybe `project-a-cache` or `project-b-audit-log`.

### Step 5: Recovery

If an agent crashes -- the process dies, the machine reboots -- the blackboard detects it. On the next CLI invocation, the auto-sweep checks PID liveness:

```bash
# This happens automatically on every blackboard command
# Internally: is process 12345 still alive? No → mark agent stale, release its work

blackboard sweep --dry-run
# Stale candidates:
#   overnight-builder (pid 12345) — last seen 3h ago — would release: project-b-user-mgmt
```

The work item returns to `available`. Another agent can claim it. No human intervention needed.

## The Full Picture

```
 ┌──────────────────────────────────────────────────────────────┐
 │                     YOU (the operator)                        │
 │                                                              │
 │  "Implement these features on project-a and project-b"       │
 │  "I'll check the dashboard in the morning"                   │
 └──────────────────────────┬───────────────────────────────────┘
                            │ registers work items
                            ▼
 ┌──────────────────────────────────────────────────────────────┐
 │                     BLACKBOARD                               │
 │                 ~/.pai/blackboard/local.db                    │
 │                                                              │
 │  project-a-cache ·········· available ···· P2                │
 │  project-a-monitoring ····· available ···· P3                │
 │  project-b-user-mgmt ····· claimed ······ P1  ◄── agent-1  │
 │  project-b-audit-log ····· available ···· P2                │
 └──────────┬───────────────────────────────┬───────────────────┘
            │                               │
   ┌────────▼────────┐             ┌────────▼────────┐
   │  ivy-heartbeat   │             │  scheduler       │
   │                  │             │                  │
   │  Runs every 60m  │             │  Queries work    │
   │  Checks calendar │             │  Claims P1 first │
   │  Checks email    │             │  Launches claude │
   │  Logs to BB      │             │  Sends heartbeats│
   └──────────────────┘             └──────────────────┘
```

**Heartbeat** handles the time dimension -- what is due, what needs checking, what changed since last run.

**Blackboard** handles the state dimension -- what work exists, who is working on it, what happened.

**Together** they create a system where projects post work, agents claim and execute it, progress is observable, failures are recoverable, and the operator wakes up to completed features.

## What This Is Not

This is not Kubernetes. It's not a CI/CD pipeline. It's not a job queue.

It's a **local coordination layer** for a single operator running multiple Claude Code agents across multiple projects. Everything is a SQLite file on your laptop. There is no server to maintain, no cloud dependency, no authentication flow.

The blackboard pattern works because the agents are local, the database is local, and the operator is one person. This is infrastructure for a solo developer who wants their projects to make progress while they sleep.

## Getting Started

```bash
# Install
git clone https://github.com/jcfischer/ivy-blackboard.git
cd ivy-blackboard
bun install
bun run build

# Register your projects
blackboard project register --id my-app --name "My Application" --path ~/work/my-app
blackboard project register --id my-api --name "My API Server" --path ~/work/my-api

# Post work
blackboard work create --id my-first-task --title "Something to build" --project my-app

# Start the dashboard
blackboard serve

# Install the heartbeat
ivy-heartbeat schedule install

# Watch it all come together
open http://localhost:3141
```
