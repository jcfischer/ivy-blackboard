import { Command } from "commander";
import type { CommandContext } from "../context";
import { registerAgent, deregisterAgent, sendHeartbeat, listAgents } from "../agent";
import { formatJson, formatTable, formatRelativeTime } from "../output";
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
    .option("--work-item <id>", "Work item ID")
    .action(
      withErrorHandling(async (opts) => {
        const ctx = getContext();
        const result = sendHeartbeat(ctx.db, {
          sessionId: opts.session,
          progress: opts.progress,
          workItemId: opts.workItem,
        });

        if (ctx.options.json) {
          console.log(formatJson(result));
        } else {
          console.log(`Heartbeat sent for ${result.session_id}`);
          console.log(`Agent: ${result.agent_name}`);
          console.log(`Time:  ${result.timestamp}`);
          if (result.progress) console.log(`Note:  ${result.progress}`);
        }
      }, () => getContext().options.json)
    );

  agent
    .command("list")
    .description("List agent sessions")
    .option("--all", "Include completed and stale agents")
    .option("--status <status>", "Filter by status (comma-separated)")
    .action(
      withErrorHandling(async (opts) => {
        const ctx = getContext();
        const agents = listAgents(ctx.db, {
          all: opts.all,
          status: opts.status,
        });

        if (ctx.options.json) {
          console.log(formatJson(agents));
        } else if (agents.length === 0) {
          console.log("No active agents.");
        } else {
          const headers = ["SESSION", "NAME", "PROJECT", "STATUS", "LAST SEEN", "PID"];
          const rows = agents.map((a) => [
            a.session_id.slice(0, 12),
            a.agent_name,
            a.project ?? "-",
            a.status,
            formatRelativeTime(a.last_seen_at),
            String(a.pid ?? "-"),
          ]);
          console.log(formatTable(headers, rows));
        }
      }, () => getContext().options.json)
    );
}
