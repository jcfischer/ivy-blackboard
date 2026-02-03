import { Command } from "commander";
import type { CommandContext } from "../context";
import { disableAutoSweep } from "../context";
import { sweepStaleAgents, sweepDryRun } from "../sweep";
import { formatJson } from "../output";
import { withErrorHandling } from "../errors";

export function registerSweepCommand(
  parent: Command,
  getContext: () => CommandContext
): void {
  parent
    .command("sweep")
    .description("Run stale agent detection and cleanup")
    .option("--dry-run", "Report without modifying")
    .option("--threshold <seconds>", "Override stale threshold (seconds)", parseInt)
    .action(
      withErrorHandling((opts) => {
        disableAutoSweep(); // Sweep command handles its own sweep
        const ctx = getContext();
        const config = opts.threshold ? { staleThresholdSeconds: opts.threshold } : undefined;

        if (opts.dryRun) {
          const dryResult = sweepDryRun(ctx.db, config);

          if (ctx.options.json) {
            console.log(formatJson({ dryRun: true, ...dryResult }));
          } else {
            if (dryResult.candidates.length === 0) {
              console.log("No stale agents detected. (dry run)");
            } else {
              console.log(`Stale detection sweep (dry run):`);
              console.log(`  Candidates: ${dryResult.candidates.length} agent(s)`);
              for (const c of dryResult.candidates) {
                console.log(`    ${c.sessionId.slice(0, 12)} ${c.agentName} (pid ${c.pid ?? "null"}, alive: ${c.pidAlive})`);
              }
            }
          }
          return;
        }

        const result = sweepStaleAgents(ctx.db, config);

        if (ctx.options.json) {
          console.log(formatJson(result));
        } else {
          if (result.staleAgents.length === 0 && result.heartbeatsPruned === 0) {
            console.log("No stale agents detected.");
          } else {
            console.log(`Stale detection sweep:`);
            console.log(`  Marked stale: ${result.staleAgents.length} agent(s)`);
            const totalReleased = result.staleAgents.reduce((n, a) => n + a.releasedItems.length, 0);
            console.log(`  Released: ${totalReleased} work item(s)`);
            console.log(`  Pruned: ${result.heartbeatsPruned} heartbeat record(s)`);
          }
        }
      }, () => getContext().options.json)
    );
}
