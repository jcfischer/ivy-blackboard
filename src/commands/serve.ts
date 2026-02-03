import { Command } from "commander";
import type { CommandContext } from "../context";

export function registerServeCommand(
  parent: Command,
  getContext: () => CommandContext
): void {
  parent
    .command("serve")
    .description("Start the web dashboard server")
    .option("--port <port>", "Port number (default: 3141)")
    .option("--background", "Run in background")
    .action(async () => {
      const ctx = getContext();
      if (ctx.options.json) {
        console.log(JSON.stringify({ ok: false, error: "Not yet implemented", timestamp: new Date().toISOString() }, null, 2));
      } else {
        console.log("Not yet implemented");
      }
    });
}
