import { Command } from "commander";
import type { CommandContext } from "../context";
import { createServer } from "../server";
import { formatJson } from "../output";
import { withErrorHandling } from "../errors";

export function registerServeCommand(
  parent: Command,
  getContext: () => CommandContext
): void {
  parent
    .command("serve")
    .description("Start the web dashboard server")
    .option("--port <port>", "Port number", "3141")
    .action(
      withErrorHandling(async (opts) => {
        const ctx = getContext();
        const port = parseInt(opts.port, 10);
        const server = createServer(ctx.db, ctx.dbPath, port);

        if (ctx.options.json) {
          console.log(
            formatJson({ port: server.port, url: `http://localhost:${server.port}` })
          );
        } else {
          console.log(`Blackboard dashboard running at http://localhost:${server.port}`);
          console.log("Press Ctrl+C to stop.");
        }

        // Keep process alive
        process.on("SIGINT", () => {
          server.stop();
          process.exit(0);
        });

        // Block until SIGINT
        await new Promise(() => {});
      }, () => getContext().options.json)
    );
}
