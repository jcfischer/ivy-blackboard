import { writeFileSync } from "node:fs";
import { Command } from "commander";
import type { CommandContext } from "../context";
import { exportSnapshot, serializeSnapshot } from "../export";
import { withErrorHandling } from "../errors";

export function registerExportCommand(
  parent: Command,
  getContext: () => CommandContext
): void {
  parent
    .command("export")
    .description("Export blackboard state as JSON snapshot")
    .option("--pretty", "Pretty-print JSON output")
    .option("--output <file>", "Write to file instead of stdout")
    .action(
      withErrorHandling(async (opts) => {
        const ctx = getContext();
        const snapshot = exportSnapshot(ctx.db, ctx.dbPath);
        const json = serializeSnapshot(snapshot, opts.pretty || ctx.options.json);

        if (opts.output) {
          writeFileSync(opts.output, json, "utf8");
          if (ctx.options.json) {
            console.log(
              JSON.stringify(
                { ok: true, file: opts.output, export_version: 1, timestamp: new Date().toISOString() },
                null,
                2
              )
            );
          } else {
            console.log(`Exported to ${opts.output}`);
          }
        } else {
          console.log(json);
        }
      }, () => getContext().options.json)
    );
}
