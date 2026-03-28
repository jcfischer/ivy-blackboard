import { Command } from "commander";
import type { CommandContext } from "../context";
import { registerProject, listProjects, getProjectStatus, removeProject, updateProjectMetadata } from "../project";
import { formatJson, formatTable } from "../output";
import { withErrorHandling } from "../errors";
import type { ProjectWorkflowMetadata } from "../types";

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

          // Display workflow metadata if present
          if (p.metadata) {
            try {
              const meta = JSON.parse(p.metadata) as Partial<ProjectWorkflowMetadata>;
              const flags: string[] = [];
              if (meta.github_issues !== undefined) flags.push(`github_issues=${meta.github_issues}`);
              if (meta.github_prs !== undefined) flags.push(`github_prs=${meta.github_prs}`);
              if (meta.github_reflect !== undefined) flags.push(`github_reflect=${meta.github_reflect}`);
              if (meta.auto_claim !== undefined) flags.push(`auto_claim=${meta.auto_claim}`);
              if (meta.github_authors_include?.length) flags.push(`authors_include=[${meta.github_authors_include.join(",")}]`);
              if (meta.github_authors_exclude?.length) flags.push(`authors_exclude=[${meta.github_authors_exclude.join(",")}]`);
              if (flags.length > 0) {
                console.log(`Workflow: ${flags.join(", ")}`);
              }
            } catch {
              // Ignore parse errors, just don't display metadata
            }
          }

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

  project
    .command("remove")
    .description("Remove a project and all its work items")
    .argument("<id>", "Project ID")
    .option("--force", "Force removal even if work items are claimed/in-progress")
    .action(
      withErrorHandling(async (id: string, opts: { force?: boolean }) => {
        const ctx = getContext();
        const result = removeProject(ctx.db, id, opts.force ?? false);

        if (ctx.options.json) {
          console.log(formatJson(result));
        } else {
          console.log(`Removed project: ${result.display_name} (${result.project_id})`);
          if (result.work_items_completed > 0) {
            console.log(`  Force-completed ${result.work_items_completed} claimed work items`);
          }
          if (result.work_items_deleted > 0) {
            console.log(`  Deleted ${result.work_items_deleted} available work items`);
          }
          if (result.agents_deregistered > 0) {
            console.log(`  Deregistered ${result.agents_deregistered} agents`);
          }
        }
      }, () => getContext().options.json)
    );

  project
    .command("update-metadata")
    .description("Update project workflow metadata (merges with existing)")
    .argument("<id>", "Project ID")
    .option("--github-issues <boolean>", "Create work items from GitHub issues (true|false)")
    .option("--github-prs <boolean>", "Create work items from GitHub PRs (true|false)")
    .option("--github-reflect <boolean>", "Create reflection tasks after PR merge (true|false)")
    .option("--auto-claim <boolean>", "Auto-claim new work items (true|false)")
    .option("--authors-include <list>", "Comma-separated list of GitHub authors to include")
    .option("--authors-exclude <list>", "Comma-separated list of GitHub authors to exclude")
    .action(
      withErrorHandling(async (id: string, opts: {
        githubIssues?: string;
        githubPrs?: string;
        githubReflect?: string;
        autoClaim?: string;
        authorsInclude?: string;
        authorsExclude?: string;
      }) => {
        const ctx = getContext();
        const updates: Record<string, unknown> = {};

        // Parse boolean flags
        if (opts.githubIssues !== undefined) {
          updates.github_issues = opts.githubIssues === "true";
        }
        if (opts.githubPrs !== undefined) {
          updates.github_prs = opts.githubPrs === "true";
        }
        if (opts.githubReflect !== undefined) {
          updates.github_reflect = opts.githubReflect === "true";
        }
        if (opts.autoClaim !== undefined) {
          updates.auto_claim = opts.autoClaim === "true";
        }

        // Parse array flags
        if (opts.authorsInclude !== undefined) {
          updates.github_authors_include = opts.authorsInclude.split(",").map(s => s.trim());
        }
        if (opts.authorsExclude !== undefined) {
          updates.github_authors_exclude = opts.authorsExclude.split(",").map(s => s.trim());
        }

        if (Object.keys(updates).length === 0) {
          throw new Error("No metadata updates provided. Use --github-issues, --github-prs, --github-reflect, --auto-claim, --authors-include, or --authors-exclude.");
        }

        const result = updateProjectMetadata(ctx.db, id, updates);

        if (ctx.options.json) {
          console.log(formatJson(result));
        } else {
          console.log(`Updated metadata for project: ${result.display_name} (${result.project_id})`);
          console.log(`Current metadata: ${JSON.stringify(result.metadata, null, 2)}`);
        }
      }, () => getContext().options.json)
    );
}
