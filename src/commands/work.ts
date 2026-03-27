import { Command } from "commander";
import type { CommandContext } from "../context";
import { createWorkItem, claimWorkItem, createAndClaimWorkItem, releaseWorkItem, completeWorkItem, forceCompleteWorkItem, bulkCompleteWorkItems, resetWorkItem, blockWorkItem, unblockWorkItem, listWorkItems, getWorkItemStatus, deleteWorkItem, updateWorkItemMetadata, appendWorkItemEvent } from "../work";
import { formatJson, formatTable, formatRelativeTime } from "../output";
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
    .option("--source <source>", "Source type (any string, e.g. github, local, operator, specflow)")
    .option("--source-ref <ref>", "External reference")
    .option("--priority <priority>", "Priority: P1, P2, P3")
    .option("--depends-on <ids>", "Comma-separated list of work item IDs this item depends on")
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
            dependsOn: opts.dependsOn,
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
            dependsOn: opts.dependsOn,
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
    .command("create")
    .description("Create a new work item")
    .requiredOption("--id <id>", "Work item ID")
    .requiredOption("--title <title>", "Title")
    .option("--description <desc>", "Description")
    .option("--project <project>", "Project ID")
    .option("--source <source>", "Source type (any string, e.g. github, local, operator, specflow)")
    .option("--source-ref <ref>", "External reference")
    .option("--priority <priority>", "Priority: P1, P2, P3")
    .option("--depends-on <ids>", "Comma-separated list of work item IDs this item depends on")
    .option("--metadata <json>", "Metadata as JSON string")
    .action(
      withErrorHandling(async (opts) => {
        const ctx = getContext();
        const result = createWorkItem(ctx.db, {
          id: opts.id,
          title: opts.title,
          description: opts.description,
          project: opts.project,
          source: opts.source,
          sourceRef: opts.sourceRef,
          priority: opts.priority,
          dependsOn: opts.dependsOn,
          metadata: opts.metadata,
        });

        if (ctx.options.json) {
          console.log(formatJson(result));
        } else {
          console.log(`Created ${result.item_id}`);
          console.log(`Title:  ${result.title}`);
          console.log(`Status: ${result.status}`);
        }
      }, () => getContext().options.json)
    );

  work
    .command("release")
    .description("Release a claimed work item")
    .requiredOption("--id <id>", "Work item ID")
    .requiredOption("--session <session>", "Session ID")
    .action(
      withErrorHandling((opts) => {
        const ctx = getContext();
        const result = releaseWorkItem(ctx.db, opts.id, opts.session);

        if (ctx.options.json) {
          console.log(formatJson(result));
        } else {
          console.log(`Released work item: ${result.item_id}`);
          console.log(`Status: available`);
        }
      }, () => getContext().options.json)
    );

  work
    .command("reset")
    .description("Reset a work item to available status (operator action)")
    .requiredOption("--id <id>", "Work item ID")
    .action(
      withErrorHandling((opts) => {
        const ctx = getContext();
        const result = resetWorkItem(ctx.db, opts.id);

        if (ctx.options.json) {
          console.log(formatJson(result));
        } else {
          console.log(`Reset work item: ${result.item_id}`);
          console.log(`Previous status: ${result.previous_status}`);
          console.log(`New status: available`);
        }
      }, () => getContext().options.json)
    );

  work
    .command("complete")
    .description("Mark a work item as completed")
    .option("--id <id>", "Work item ID (required for single item)")
    .option("--session <session>", "Session ID (required unless --force or item unclaimed)")
    .option("--force", "Force complete regardless of claim status")
    .option("--project <project>", "Project ID (use with --all for bulk completion)")
    .option("--all", "Complete all items in project (requires --project)")
    .action(
      withErrorHandling(async (opts) => {
        const ctx = getContext();

        // Bulk completion mode
        if (opts.all) {
          if (!opts.project) {
            throw new Error("--all requires --project <project-id>");
          }

          // Confirmation prompt
          const readline = await import("readline");
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          });

          const answer = await new Promise<string>((resolve) => {
            rl.question(
              `This will force-complete all work items in project "${opts.project}". Continue? (yes/no): `,
              resolve
            );
          });
          rl.close();

          if (answer.toLowerCase() !== "yes") {
            console.log("Cancelled.");
            return;
          }

          const result = bulkCompleteWorkItems(ctx.db, opts.project, opts.session);

          if (ctx.options.json) {
            console.log(formatJson(result));
          } else {
            console.log(`Bulk completion results for project: ${opts.project}`);
            console.log(`Completed: ${result.completed_count}`);
            console.log(`Failed: ${result.failed_count}`);
            if (result.failed_count > 0) {
              console.log("\nFailures:");
              for (const item of result.items.filter((i) => !i.success)) {
                console.log(`  ${item.item_id}: ${item.error}`);
              }
            }
          }
          return;
        }

        // Single item completion
        if (!opts.id) {
          throw new Error("--id is required for single item completion");
        }

        let result;
        if (opts.force) {
          // Force completion mode
          result = forceCompleteWorkItem(ctx.db, opts.id, opts.session);
        } else {
          // Normal completion mode
          if (!opts.session) {
            throw new Error("--session is required (or use --force)");
          }
          result = completeWorkItem(ctx.db, opts.id, opts.session);
        }

        if (ctx.options.json) {
          console.log(formatJson(result));
        } else {
          console.log(`Completed work item: ${result.item_id}`);
          console.log(`Completed at: ${result.completed_at}`);
        }
      }, () => getContext().options.json)
    );

  work
    .command("block")
    .description("Block a work item")
    .requiredOption("--id <id>", "Work item ID")
    .option("--blocked-by <item-id>", "Blocking work item ID")
    .action(
      withErrorHandling((opts) => {
        const ctx = getContext();
        const result = blockWorkItem(ctx.db, opts.id, { blockedBy: opts.blockedBy });

        if (ctx.options.json) {
          console.log(formatJson(result));
        } else {
          console.log(`Blocked work item: ${result.item_id}`);
          if (result.blocked_by) console.log(`Blocked by: ${result.blocked_by}`);
          console.log(`Previous status: ${result.previous_status}`);
        }
      }, () => getContext().options.json)
    );

  work
    .command("unblock")
    .description("Unblock a blocked work item")
    .requiredOption("--id <id>", "Work item ID")
    .action(
      withErrorHandling((opts) => {
        const ctx = getContext();
        const result = unblockWorkItem(ctx.db, opts.id);

        if (ctx.options.json) {
          console.log(formatJson(result));
        } else {
          console.log(`Unblocked work item: ${result.item_id}`);
          console.log(`Restored status: ${result.restored_status}`);
        }
      }, () => getContext().options.json)
    );

  work
    .command("delete")
    .description("Delete a work item")
    .argument("<item-id>", "Work item ID")
    .option("--force", "Force delete even if claimed", false)
    .action(
      withErrorHandling((itemId, opts) => {
        const ctx = getContext();
        const result = deleteWorkItem(ctx.db, itemId, opts.force);

        if (ctx.options.json) {
          console.log(formatJson(result));
        } else {
          console.log(`Deleted work item: ${result.item_id}`);
          console.log(`Title:  ${result.title}`);
          console.log(`Was:    ${result.previous_status}`);
          if (result.was_claimed_by) console.log(`Claimed by: ${result.was_claimed_by}`);
        }
      }, () => getContext().options.json)
    );

  work
    .command("list")
    .description("List work items")
    .option("--all", "Show all statuses (default: available only)")
    .option("--project <project>", "Filter by project")
    .option("--status <status>", "Filter by status (comma-separated)")
    .option("--priority <priority>", "Filter by priority (comma-separated)")
    .option("--show-scores", "Display effective priority scores")
    .action(
      withErrorHandling((opts) => {
        const ctx = getContext();
        const items = listWorkItems(ctx.db, {
          all: opts.all,
          status: opts.status,
          priority: opts.priority,
          project: opts.project,
          showScores: opts.showScores,
        });

        if (ctx.options.json) {
          console.log(formatJson(items));
        } else if (items.length === 0) {
          console.log("No work items.");
        } else {
          const headers = opts.showScores
            ? ["ID", "TITLE", "PROJECT", "STATUS", "PRIORITY", "SCORE", "CLAIMED BY", "CREATED"]
            : ["ID", "TITLE", "PROJECT", "STATUS", "PRIORITY", "CLAIMED BY", "CREATED"];
          const rows = items.map(i => {
            const baseRow = [
              i.item_id.slice(0, 12),
              i.title,
              i.project_name ?? i.project_id ?? "-",
              i.status,
              i.priority,
            ];
            if (opts.showScores) {
              baseRow.push(i.effective_score?.toFixed(1) ?? "N/A");
            }
            baseRow.push(
              i.claimed_by ? i.claimed_by.slice(0, 12) : "-",
              formatRelativeTime(i.created_at)
            );
            return baseRow;
          });
          console.log(formatTable(headers, rows));
        }
      }, () => getContext().options.json)
    );

  work
    .command("status")
    .description("Show detailed work item status")
    .argument("<id>", "Work item ID")
    .action(
      withErrorHandling((id) => {
        const ctx = getContext();
        const detail = getWorkItemStatus(ctx.db, id);

        if (ctx.options.json) {
          console.log(formatJson({ ...detail.item, history: detail.history }));
        } else {
          const i = detail.item;
          console.log(`Item:     ${i.item_id}`);
          console.log(`Title:    ${i.title}`);
          console.log(`Status:   ${i.status}`);
          console.log(`Priority: ${i.priority}`);
          console.log(`Source:   ${i.source}`);
          if (i.project_id) console.log(`Project:  ${i.project_id}`);
          if (i.description) console.log(`Desc:     ${i.description}`);
          if (i.claimed_by) console.log(`Claimed:  ${i.claimed_by} at ${i.claimed_at}`);
          if (i.blocked_by) console.log(`BlockedBy: ${i.blocked_by} (manual)`);
          if (i.depends_on) {
            const depIds = i.depends_on.split(",").map(id => id.trim()).filter(Boolean);
            console.log(`DependsOn: ${i.depends_on}`);
            // Show completion status of each dependency
            for (const depId of depIds) {
              const dep = ctx.db.query("SELECT item_id, title, status FROM work_items WHERE item_id = ?").get(depId) as any;
              if (dep) {
                const statusSymbol = dep.status === 'completed' ? '✓' : '○';
                console.log(`  ${statusSymbol} ${dep.item_id}: ${dep.title} (${dep.status})`);
              }
            }
          }
          if (i.source_ref) console.log(`Ref:      ${i.source_ref}`);
          console.log(`Created:  ${i.created_at}`);
          if (detail.history.length > 0) {
            console.log(`\nTimeline:`);
            for (const e of detail.history) {
              console.log(`  ${e.timestamp}  ${e.event_type}  ${e.summary}`);
            }
          }
        }
      }, () => getContext().options.json)
    );

  work
    .command("update-metadata")
    .description("Merge metadata keys into a work item")
    .requiredOption("--id <id>", "Work item ID")
    .requiredOption("--metadata <json>", "JSON object of keys to merge")
    .action(
      withErrorHandling((opts) => {
        const ctx = getContext();
        let updates: Record<string, unknown>;
        try {
          updates = JSON.parse(opts.metadata);
        } catch {
          throw new Error(`Invalid JSON: ${opts.metadata}`);
        }

        const result = updateWorkItemMetadata(ctx.db, opts.id, updates);

        if (ctx.options.json) {
          console.log(formatJson(result));
        } else {
          console.log(`Updated metadata for ${result.item_id}`);
          console.log(`Metadata: ${JSON.stringify(result.metadata, null, 2)}`);
        }
      }, () => getContext().options.json)
    );

  work
    .command("append-event")
    .description("Append a structured event to a work item")
    .requiredOption("--id <id>", "Work item ID")
    .requiredOption("--event-type <type>", "Event type")
    .requiredOption("--summary <text>", "Event summary")
    .option("--actor <actor-id>", "Actor ID")
    .option("--metadata <json>", "Event metadata as JSON")
    .action(
      withErrorHandling((opts) => {
        const ctx = getContext();
        let metadata: Record<string, unknown> | undefined;
        if (opts.metadata) {
          try {
            metadata = JSON.parse(opts.metadata);
          } catch {
            throw new Error(`Invalid JSON: ${opts.metadata}`);
          }
        }

        const result = appendWorkItemEvent(ctx.db, opts.id, {
          event_type: opts.eventType,
          summary: opts.summary,
          actor_id: opts.actor,
          metadata,
        });

        if (ctx.options.json) {
          console.log(formatJson(result));
        } else {
          console.log(`Appended ${result.event_type} event to ${result.item_id}`);
          console.log(`Event ID: ${result.event_id}`);
          console.log(`At: ${result.timestamp}`);
        }
      }, () => getContext().options.json)
    );
}
