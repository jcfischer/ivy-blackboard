import { Command } from "commander";
import type { CommandContext } from "../context";

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
    .option("--project <project>", "Project ID")
    .option("--source <source>", "Source: github, local, operator")
    .option("--source-ref <ref>", "External reference")
    .option("--session <session>", "Session ID of claiming agent")
    .action(async () => {
      const ctx = getContext();
      if (ctx.options.json) {
        console.log(JSON.stringify({ ok: false, error: "Not yet implemented", timestamp: new Date().toISOString() }, null, 2));
      } else {
        console.log("Not yet implemented");
      }
    });

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
