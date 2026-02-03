import { Command } from "commander";
import type { CommandContext } from "../context";
import { observeEvents } from "../events";
import { formatJson } from "../output";
import { formatTimeline } from "../output";
import { withErrorHandling } from "../errors";

export function registerObserveCommand(
  parent: Command,
  getContext: () => CommandContext
): void {
  parent
    .command("observe")
    .description("Show event log since last check")
    .option("--session <id>", "Filter by session ID prefix")
    .option("--since <time>", "Show events since duration (e.g., 1h, 30m, 2d)")
    .option("--filter <types>", "Comma-separated event type filter")
    .option("--limit <n>", "Max events to return", "50")
    .action(
      withErrorHandling(async (opts) => {
        const ctx = getContext();
        const events = observeEvents(ctx.db, {
          since: opts.since,
          type: opts.filter,
          session: opts.session,
          limit: parseInt(opts.limit, 10),
        });

        if (ctx.options.json) {
          console.log(
            formatJson({ count: events.length, items: events })
          );
        } else if (events.length === 0) {
          console.log("No events.");
        } else {
          console.log(formatTimeline(events));
        }
      }, () => getContext().options.json)
    );
}
