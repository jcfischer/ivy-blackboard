import { Command } from "commander";
import type { CommandContext } from "../context";
import { createWorkItem, claimWorkItem, createAndClaimWorkItem } from "../work";
import { formatJson } from "../output";
import { withErrorHandling } from "../errors";

export function registerWorkCommands(
  parent: Command,
  getContext: () => CommandContext
): void {
  const work = parent
    .command("work")
    .description("Manage work items");

  work
    .command("claim")
    .description("Create and/or claim a work item")
    .requiredOption("--id <id>", "Work item ID")
    .option("--title <title>", "Title (creates new item if provided)")
    .option("--description <desc>", "Description")
    .option("--project <project>", "Project ID")
    .option("--source <source>", "Source: github, local, operator")
    .option("--source-ref <ref>", "External reference")
    .option("--priority <priority>", "Priority: P1, P2, P3")
    .option("--session <session>", "Session ID of claiming agent")
    .option("--metadata <json>", "Metadata as JSON string")
    .action(
      withErrorHandling(async (opts) => {
        const ctx = getContext();
        let result;

        if (opts.title && opts.session) {
          // Create and claim
          result = createAndClaimWorkItem(ctx.db, {
            id: opts.id,
            title: opts.title,
            description: opts.description,
            project: opts.project,
            source: opts.source,
            sourceRef: opts.sourceRef,
            priority: opts.priority,
            metadata: opts.metadata,
          }, opts.session);
        } else if (opts.title) {
          // Create only
          result = createWorkItem(ctx.db, {
            id: opts.id,
            title: opts.title,
            description: opts.description,
            project: opts.project,
            source: opts.source,
            sourceRef: opts.sourceRef,
            priority: opts.priority,
            metadata: opts.metadata,
          });
        } else {
          // Claim existing
          const claimResult = claimWorkItem(ctx.db, opts.id, opts.session);
          if (ctx.options.json) {
            console.log(formatJson(claimResult));
          } else {
            if (claimResult.claimed) {
              console.log(`Claimed ${claimResult.item_id}`);
              console.log(`By: ${claimResult.claimed_by}`);
              console.log(`At: ${claimResult.claimed_at}`);
            } else {
              console.log(`Could not claim ${claimResult.item_id} (already claimed)`);
            }
          }
          return;
        }

        if (ctx.options.json) {
          console.log(formatJson(result));
        } else {
          console.log(`${result.status === "claimed" ? "Created and claimed" : "Created"} ${result.item_id}`);
          console.log(`Title:  ${result.title}`);
          console.log(`Status: ${result.status}`);
          if (result.claimed_by) console.log(`By:     ${result.claimed_by}`);
        }
      }, () => getContext().options.json)
    );

  work
    .command("release")
    .description("Release a claimed work item")
    .requiredOption("--id <id>", "Work item ID")
    .requiredOption("--session <session>", "Session ID")
    .action(async () => {
      const ctx = getContext();
      if (ctx.options.json) {
        console.log(JSON.stringify({ ok: false, error: "Not yet implemented", timestamp: new Date().toISOString() }, null, 2));
      } else {
        console.log("Not yet implemented");
      }
    });

  work
    .command("complete")
    .description("Mark a work item as completed")
    .requiredOption("--id <id>", "Work item ID")
    .requiredOption("--session <session>", "Session ID")
    .action(async () => {
      const ctx = getContext();
      if (ctx.options.json) {
        console.log(JSON.stringify({ ok: false, error: "Not yet implemented", timestamp: new Date().toISOString() }, null, 2));
      } else {
        console.log("Not yet implemented");
      }
    });

  work
    .command("list")
    .description("List work items")
    .option("--project <project>", "Filter by project")
    .option("--status <status>", "Filter by status")
    .action(async () => {
      const ctx = getContext();
      if (ctx.options.json) {
        console.log(JSON.stringify({ ok: true, count: 0, items: [], timestamp: new Date().toISOString() }, null, 2));
      } else {
        console.log("No work items.");
      }
    });

  work
    .command("status")
    .description("Show detailed work item status")
    .argument("<id>", "Work item ID")
    .action(async () => {
      const ctx = getContext();
      if (ctx.options.json) {
        console.log(JSON.stringify({ ok: false, error: "Not yet implemented", timestamp: new Date().toISOString() }, null, 2));
      } else {
        console.log("Not yet implemented");
      }
    });
}
