import { Command } from "commander";
import type { CommandContext } from "../context";
import { registerProject, listProjects } from "../project";
import { formatJson, formatTable } from "../output";
import { withErrorHandling } from "../errors";

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
    .option("--metadata <json>", "Metadata as JSON string")
    .action(
      withErrorHandling(async (opts) => {
        const ctx = getContext();
        const result = registerProject(ctx.db, {
          id: opts.id,
          name: opts.name,
          path: opts.path,
          repo: opts.repo,
          metadata: opts.metadata,
        });

        if (ctx.options.json) {
          console.log(formatJson(result));
        } else {
          console.log(`Registered project ${result.project_id}`);
          console.log(`Name: ${result.display_name}`);
          if (result.local_path) console.log(`Path: ${result.local_path}`);
          if (result.remote_repo) console.log(`Repo: ${result.remote_repo}`);
          console.log(`At:   ${result.registered_at}`);
        }
      }, () => getContext().options.json)
    );

  project
    .command("list")
    .description("List registered projects")
    .action(
      withErrorHandling(async () => {
        const ctx = getContext();
        const projects = listProjects(ctx.db);

        if (ctx.options.json) {
          console.log(formatJson(projects));
        } else if (projects.length === 0) {
          console.log("No projects registered.");
        } else {
          const headers = ["PROJECT", "NAME", "PATH", "REPO", "AGENTS"];
          const rows = projects.map((p) => [
            p.project_id,
            p.display_name,
            p.local_path ?? "-",
            p.remote_repo ?? "-",
            String(p.active_agents),
          ]);
          console.log(formatTable(headers, rows));
        }
      }, () => getContext().options.json)
    );

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
