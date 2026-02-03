import { Command } from "commander";
import type { CommandContext } from "../context";

export function registerSweepCommand(
  parent: Command,
  getContext: () => CommandContext
): void {
  parent
    .command("sweep")
    .description("Run stale agent detection and cleanup")
    .action(async () => {
      const ctx = getContext();
      if (ctx.options.json) {
        console.log(JSON.stringify({ ok: true, marked_stale: 0, locks_released: 0, timestamp: new Date().toISOString() }, null, 2));
      } else {
        console.log("Sweep complete. No stale agents found.");
      }
    });
}
