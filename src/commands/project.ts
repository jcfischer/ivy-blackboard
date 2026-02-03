import { Command } from "commander";
import type { CommandContext } from "../context";

export function registerProjectCommands(
  parent: Command,
  getContext: () => CommandContext
): void {
  const project = parent
    .command("project")
    .description("Manage projects");

  project
    .command("register")
    .description("Register a project")
    .requiredOption("--id <id>", "Project slug")
    .requiredOption("--name <name>", "Display name")
    .option("--path <path>", "Local path")
    .option("--repo <repo>", "Remote repository")
    .action(async () => {
      const ctx = getContext();
      if (ctx.options.json) {
        console.log(JSON.stringify({ ok: false, error: "Not yet implemented", timestamp: new Date().toISOString() }, null, 2));
      } else {
        console.log("Not yet implemented");
      }
    });

  project
    .command("list")
    .description("List registered projects")
    .action(async () => {
      const ctx = getContext();
      if (ctx.options.json) {
        console.log(JSON.stringify({ ok: true, count: 0, items: [], timestamp: new Date().toISOString() }, null, 2));
      } else {
        console.log("No projects registered.");
      }
    });

  project
    .command("status")
    .description("Show project status with agents and work items")
    .argument("<id>", "Project ID")
    .action(async () => {
      const ctx = getContext();
      if (ctx.options.json) {
        console.log(JSON.stringify({ ok: false, error: "Not yet implemented", timestamp: new Date().toISOString() }, null, 2));
      } else {
        console.log("Not yet implemented");
      }
    });
}
