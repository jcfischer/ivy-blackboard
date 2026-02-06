import { Command } from "commander";
import type { CommandContext } from "../context";
import { registerProject, listProjects, getProjectStatus } from "../project";
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
          const verb = result.updated ? "Updated" : "Registered";
          console.log(`${verb} project ${result.project_id}`);
          console.log(`Name: ${result.display_name}`);
          if (result.local_path) console.log(`Path: ${result.local_path}`);
          if (result.remote_repo) console.log(`Repo: ${result.remote_repo}`);
          if (!result.updated) console.log(`At:   ${result.registered_at}`);
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
    .action(
      withErrorHandling(async (id: string) => {
        const ctx = getContext();
        const status = getProjectStatus(ctx.db, id);

        if (ctx.options.json) {
          console.log(formatJson(status));
        } else {
          const p = status.project;
          console.log(`PROJECT: ${p.display_name} (${p.project_id})`);
          if (p.local_path) console.log(`Path: ${p.local_path}`);
          if (p.remote_repo) console.log(`Repo: ${p.remote_repo}`);
          console.log(`Registered: ${p.registered_at}`);
          console.log();

          // Agents section
          console.log(`ACTIVE AGENTS (${status.agents.length}):`);
          if (status.agents.length === 0) {
            console.log("  No active agents.");
          } else {
            for (const a of status.agents) {
              const work = a.current_work ? ` — ${a.current_work}` : "";
              console.log(`  - ${a.agent_name} [${a.session_id}] (${a.status})${work}`);
            }
          }
          console.log();

          // Work items section grouped by status
          const grouped: Record<string, typeof status.work_items> = {};
          for (const w of status.work_items) {
            if (!grouped[w.status]) grouped[w.status] = [];
            grouped[w.status].push(w);
          }

          const totalItems = status.work_items.length;
          console.log(`WORK ITEMS (${totalItems}):`);
          if (totalItems === 0) {
            console.log("  No work items.");
          } else {
            for (const s of ["available", "claimed", "completed", "blocked"]) {
              const items = grouped[s];
              if (!items || items.length === 0) continue;
              console.log(`  ${s.charAt(0).toUpperCase() + s.slice(1)} (${items.length}):`);
              for (const w of items) {
                let detail = w.priority;
                if (w.claimed_by) detail += ` claimed:${w.claimed_by.slice(0, 8)}`;
                if (w.blocked_by) detail += ` blocked:${w.blocked_by}`;
                console.log(`    [${w.item_id}] ${w.title} — ${detail}`);
              }
            }
          }
        }
      }, () => getContext().options.json)
    );
}
