import { Command } from "commander";
import type { CommandContext } from "../context";
import { registerAgent, deregisterAgent } from "../agent";
import { formatJson } from "../output";
import { withErrorHandling } from "../errors";

export function registerAgentCommands(
  parent: Command,
  getContext: () => CommandContext
): void {
  const agent = parent
    .command("agent")
    .description("Manage agent sessions");

  agent
    .command("register")
    .description("Register a new agent session")
    .requiredOption("--name <name>", "Agent display name")
    .option("--project <project>", "Project context")
    .option("--work <work>", "Current work description")
    .option("--parent <sessionId>", "Parent session ID (for delegates)")
    .option("--session-hint <hint>", "Session hint for stable ID generation")
    .action(
      withErrorHandling(async (opts) => {
        const ctx = getContext();
        const result = registerAgent(ctx.db, {
          name: opts.name,
          project: opts.project,
          work: opts.work,
          parentId: opts.parent,
        });

        if (ctx.options.json) {
          console.log(formatJson(result));
        } else {
          console.log(`Registered agent session ${result.session_id}`);
          console.log(`Name:    ${result.agent_name}`);
          if (result.project) console.log(`Project: ${result.project}`);
          if (result.current_work) console.log(`Work:    ${result.current_work}`);
          console.log(`PID:     ${result.pid}`);
          console.log(`Started: ${result.started_at}`);
          if (result.parent_id) console.log(`Parent:  ${result.parent_id}`);
        }
      }, () => getContext().options.json)
    );

  agent
    .command("deregister")
    .description("Deregister an agent session")
    .requiredOption("--session <id>", "Session ID to deregister")
    .action(
      withErrorHandling(async (opts) => {
        const ctx = getContext();
        const result = deregisterAgent(ctx.db, opts.session);

        if (ctx.options.json) {
          console.log(formatJson(result));
        } else {
          console.log(`Deregistered ${result.session_id} (${result.agent_name})`);
          console.log(`Released ${result.released_count} claimed work item(s)`);
          const mins = Math.floor(result.duration_seconds / 60);
          const secs = result.duration_seconds % 60;
          console.log(`Session duration: ${mins > 0 ? `${mins} minutes ` : ""}${secs} seconds`);
        }
      }, () => getContext().options.json)
    );

  agent
    .command("heartbeat")
    .description("Send agent heartbeat")
    .requiredOption("--session <id>", "Session ID")
    .option("--progress <text>", "Progress note")
    .action(async () => {
      const ctx = getContext();
      if (ctx.options.json) {
        console.log(JSON.stringify({ ok: false, error: "Not yet implemented", timestamp: new Date().toISOString() }, null, 2));
      } else {
        console.log("Not yet implemented");
      }
    });

  agent
    .command("list")
    .description("List agent sessions")
    .option("--all", "Include completed and stale agents")
    .option("--status <status>", "Filter by status")
    .action(async () => {
      const ctx = getContext();
      if (ctx.options.json) {
        console.log(JSON.stringify({ ok: true, count: 0, items: [], timestamp: new Date().toISOString() }, null, 2));
      } else {
        console.log("No agents registered.");
      }
    });
}
