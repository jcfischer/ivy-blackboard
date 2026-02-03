import { Command } from "commander";
import type { CommandContext } from "../context";
import { formatJson, formatTable } from "../output";
import { getOverallStatus } from "../status";

export function registerStatusCommand(
  parent: Command,
  getContext: () => CommandContext
): void {
  parent
    .command("status")
    .description("Show overall blackboard health")
    .action(async () => {
      const ctx = getContext();
      const status = getOverallStatus(ctx.db, ctx.dbPath);

      if (ctx.options.json) {
        console.log(formatJson(status));
      } else {
        const agentMap = status.agents;
        const workMap = status.work_items;

        console.log("Local Blackboard Status");
        console.log(`Database: ${status.database} (${status.database_size})`);
        console.log();
        console.log(
          `Agents:    ${agentMap.active ?? 0} active, ${agentMap.idle ?? 0} idle, ${agentMap.stale ?? 0} stale, ${agentMap.completed ?? 0} completed`
        );
        console.log(`Projects:  ${status.projects} registered`);
        console.log(
          `Work:      ${workMap.claimed ?? 0} claimed, ${workMap.available ?? 0} available, ${workMap.blocked ?? 0} blocked, ${workMap.completed ?? 0} completed`
        );
        console.log(`Events:    ${status.events_24h} (last 24h)`);

        if (status.active_agents.length > 0) {
          console.log();
          console.log("Active Agents:");
          console.log(
            formatTable(
              ["SESSION", "NAME", "PROJECT", "WORK", "LAST SEEN"],
              status.active_agents.map((a) => [
                a.session_id.slice(0, 12),
                a.agent_name,
                a.project ?? "--",
                a.current_work ?? "--",
                a.last_seen_at,
              ])
            )
          );
        }
      }
    });
}
