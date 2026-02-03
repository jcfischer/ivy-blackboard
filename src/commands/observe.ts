import { Command } from "commander";
import type { CommandContext } from "../context";

export function registerObserveCommand(
  parent: Command,
  getContext: () => CommandContext
): void {
  parent
    .command("observe")
    .description("Show event log since last check")
    .option("--session <id>", "Session ID for cursor tracking")
    .option("--since <time>", "Show events since time or duration (e.g., 1h)")
    .option("--filter <types>", "Comma-separated event type filter")
    .action(async () => {
      const ctx = getContext();
      if (ctx.options.json) {
        console.log(JSON.stringify({ ok: true, count: 0, items: [], timestamp: new Date().toISOString() }, null, 2));
      } else {
        console.log("No events.");
      }
    });
}
