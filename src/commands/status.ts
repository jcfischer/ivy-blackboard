import { Command } from "commander";
import type { CommandContext } from "../context";
import { formatJson, formatTable } from "../output";

export function registerStatusCommand(
  parent: Command,
  getContext: () => CommandContext
): void {
  parent
    .command("status")
    .description("Show overall blackboard health")
    .action(async () => {
      const ctx = getContext();
      const { db } = ctx;

      const agentCounts = db
        .query("SELECT status, COUNT(*) as count FROM agents GROUP BY status")
        .all() as { status: string; count: number }[];

      const workCounts = db
        .query("SELECT status, COUNT(*) as count FROM work_items GROUP BY status")
        .all() as { status: string; count: number }[];

      const projectCount = (
        db.query("SELECT COUNT(*) as count FROM projects").get() as { count: number }
      ).count;

      const eventCount = (
        db
          .query(
            "SELECT COUNT(*) as count FROM events WHERE timestamp > datetime('now', '-24 hours')"
          )
          .get() as { count: number }
      ).count;

      const activeAgents = db
        .query(
          "SELECT session_id, agent_name, project, current_work, last_seen_at FROM agents WHERE status = 'active'"
        )
        .all();

      const data = {
        database: ctx.dbPath,
        agents: Object.fromEntries(
          agentCounts.map((a) => [a.status, a.count])
        ),
        projects: projectCount,
        work_items: Object.fromEntries(
          workCounts.map((w) => [w.status, w.count])
        ),
        events_24h: eventCount,
        active_agents: activeAgents,
      };

      if (ctx.options.json) {
        console.log(formatJson(data));
      } else {
        const agentMap = data.agents as Record<string, number>;
        const workMap = data.work_items as Record<string, number>;

        console.log("Local Blackboard Status");
        console.log(`Database: ${data.database}`);
        console.log();
        console.log(
          `Agents:    ${agentMap.active ?? 0} active, ${agentMap.idle ?? 0} idle, ${agentMap.stale ?? 0} stale, ${agentMap.completed ?? 0} completed`
        );
        console.log(`Projects:  ${data.projects} registered`);
        console.log(
          `Work:      ${workMap.claimed ?? 0} claimed, ${workMap.available ?? 0} available, ${workMap.blocked ?? 0} blocked, ${workMap.completed ?? 0} completed`
        );
        console.log(`Events:    ${data.events_24h} (last 24h)`);

        if ((activeAgents as any[]).length > 0) {
          console.log();
          console.log("Active Agents:");
          console.log(
            formatTable(
              ["SESSION", "NAME", "PROJECT", "WORK", "LAST SEEN"],
              (activeAgents as any[]).map((a) => [
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
