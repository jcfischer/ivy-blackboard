import { Command } from "commander";
import type { CommandContext } from "../context";

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
    .option("--name <name>", "Agent display name")
    .option("--project <project>", "Project context")
    .option("--work <work>", "Current work description")
    .option("--parent <sessionId>", "Parent session ID (for delegates)")
    .option("--session-hint <hint>", "Session hint for stable ID generation")
    .action(async () => {
      const ctx = getContext();
      if (ctx.options.json) {
        console.log(JSON.stringify({ ok: false, error: "Not yet implemented", timestamp: new Date().toISOString() }, null, 2));
      } else {
        console.log("Not yet implemented");
      }
    });

  agent
    .command("deregister")
    .description("Deregister an agent session")
    .requiredOption("--session <id>", "Session ID to deregister")
    .action(async () => {
      const ctx = getContext();
      if (ctx.options.json) {
        console.log(JSON.stringify({ ok: false, error: "Not yet implemented", timestamp: new Date().toISOString() }, null, 2));
      } else {
        console.log("Not yet implemented");
      }
    });

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
