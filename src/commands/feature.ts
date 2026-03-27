import { Command } from "commander";
import type { CommandContext } from "../context";
import { listFeatures, getFeature, updateFeature } from "../specflow-features";
import { formatJson, formatTable, formatRelativeTime } from "../output";
import { withErrorHandling } from "../errors";
import type { SpecFlowFeature } from "../types";

/**
 * Map a completed phase back one step for reset.
 * e.g. if feature failed at "completing", reset to "implemented" to retry.
 */
const PREVIOUS_PHASE: Record<string, string> = {
  specifying: "queued",
  specified: "queued",
  planning: "specified",
  planned: "specified",
  tasking: "planned",
  tasked: "planned",
  implementing: "tasked",
  implemented: "tasked",
  completing: "implemented",
  completed: "implemented",
  failed: "queued", // fallback
};

export function registerFeatureCommands(
  parent: Command,
  getContext: () => CommandContext
): void {
  const feature = parent
    .command("feature")
    .description("Manage specflow features in the orchestrator");

  // ─── list ───────────────────────────────────────────────────────────

  feature
    .command("list")
    .description("List specflow features")
    .option("--project <id>", "Filter by project")
    .option("--status <status>", "Filter by status (pending, active, failed, blocked)")
    .option("--phase <phase>", "Filter by phase")
    .action(
      withErrorHandling(async (opts) => {
        const ctx = getContext();
        const features = listFeatures(ctx.db, {
          projectId: opts.project,
          status: opts.status,
          phase: opts.phase,
        });

        if (ctx.options.json) {
          console.log(formatJson(features));
          return;
        }

        if (features.length === 0) {
          console.log("No features found.");
          return;
        }

        const headers = ["ID", "PROJECT", "PHASE", "STATUS", "FAILS", "SCORE", "ERROR"];
        const rows = features.map((f) => [
          f.feature_id,
          f.project_id,
          f.phase,
          f.status,
          `${f.failure_count}/${f.max_failures}`,
          [
            f.specify_score != null ? `S:${f.specify_score}` : null,
            f.plan_score != null ? `P:${f.plan_score}` : null,
            f.implement_score != null ? `I:${f.implement_score}` : null,
          ].filter(Boolean).join(" ") || "-",
          f.last_error ? f.last_error.slice(0, 60) : "-",
        ]);

        console.log(formatTable(headers, rows));
      })
    );

  // ─── reset ──────────────────────────────────────────────────────────

  feature
    .command("reset <feature-id>")
    .description("Reset a failed feature to retry from its current phase")
    .option("--phase <phase>", "Override: reset to a specific phase (e.g. specified, planned, tasked, implemented)")
    .option("--to-start", "Reset all the way back to queued")
    .action(
      withErrorHandling(async (featureId: string, opts) => {
        const ctx = getContext();
        const f = getFeature(ctx.db, featureId);

        if (!f) {
          console.error(`Feature "${featureId}" not found.`);
          process.exit(1);
        }

        let targetPhase: string;
        if (opts.toStart) {
          targetPhase = "queued";
        } else if (opts.phase) {
          targetPhase = opts.phase;
        } else {
          // Auto-detect: go back one step from where it failed
          targetPhase = PREVIOUS_PHASE[f.phase] ?? "queued";
        }

        const updates: Partial<Omit<SpecFlowFeature, "feature_id" | "created_at">> = {
          phase: targetPhase as SpecFlowFeature["phase"],
          status: "pending",
          failure_count: 0,
          last_error: null,
          last_phase_error: null,
          current_session: null,
        };

        updateFeature(ctx.db, featureId, updates);

        if (ctx.options.json) {
          console.log(formatJson({ featureId, previousPhase: f.phase, previousStatus: f.status, resetTo: targetPhase }));
        } else {
          console.log(`Reset ${featureId}: ${f.phase}/${f.status} → ${targetPhase}/pending (failures: ${f.failure_count} → 0)`);
        }
      })
    );

  // ─── status ─────────────────────────────────────────────────────────

  feature
    .command("status <feature-id>")
    .description("Show detailed status of a specflow feature")
    .action(
      withErrorHandling(async (featureId: string) => {
        const ctx = getContext();
        const f = getFeature(ctx.db, featureId);

        if (!f) {
          console.error(`Feature "${featureId}" not found.`);
          process.exit(1);
        }

        if (ctx.options.json) {
          console.log(formatJson(f));
          return;
        }

        console.log(`Feature: ${f.feature_id}`);
        console.log(`  Project:    ${f.project_id}`);
        console.log(`  Title:      ${f.title}`);
        console.log(`  Phase:      ${f.phase}`);
        console.log(`  Status:     ${f.status}`);
        console.log(`  Failures:   ${f.failure_count}/${f.max_failures}`);
        if (f.specify_score != null) console.log(`  Spec Score: ${f.specify_score}`);
        if (f.plan_score != null) console.log(`  Plan Score: ${f.plan_score}`);
        if (f.implement_score != null) console.log(`  Impl Score: ${f.implement_score}`);
        if (f.pr_url) console.log(`  PR:         ${f.pr_url}`);
        if (f.last_error) console.log(`  Last Error: ${f.last_error}`);
        if (f.last_phase_error) console.log(`  Phase Error: ${f.last_phase_error}`);
        if (f.depends_on) console.log(`  Depends On: ${f.depends_on}`);
        if (f.worktree_path) console.log(`  Worktree:   ${f.worktree_path}`);
        console.log(`  Created:    ${formatRelativeTime(f.created_at)}`);
        if (f.updated_at) console.log(`  Updated:    ${formatRelativeTime(f.updated_at)}`);
      })
    );

  // ─── failed (shortcut) ─────────────────────────────────────────────

  feature
    .command("failed")
    .description("List all failed features")
    .action(
      withErrorHandling(async () => {
        const ctx = getContext();
        const features = listFeatures(ctx.db, { status: "failed" });

        if (ctx.options.json) {
          console.log(formatJson(features));
          return;
        }

        if (features.length === 0) {
          console.log("No failed features.");
          return;
        }

        const headers = ["ID", "PROJECT", "PHASE", "FAILS", "ERROR"];
        const rows = features.map((f) => [
          f.feature_id,
          f.project_id,
          f.phase,
          `${f.failure_count}/${f.max_failures}`,
          f.last_error ? f.last_error.slice(0, 80) : "-",
        ]);

        console.log(formatTable(headers, rows));
      })
    );

  // ─── reset-all-failed ──────────────────────────────────────────────

  feature
    .command("reset-all-failed")
    .description("Reset ALL failed features to retry from their current phase")
    .option("--project <id>", "Only reset features in this project")
    .action(
      withErrorHandling(async (opts) => {
        const ctx = getContext();
        const features = listFeatures(ctx.db, {
          status: "failed",
          projectId: opts.project,
        });

        if (features.length === 0) {
          console.log("No failed features to reset.");
          return;
        }

        const results: Array<{ id: string; from: string; to: string }> = [];

        for (const f of features) {
          const targetPhase = PREVIOUS_PHASE[f.phase] ?? "queued";
          updateFeature(ctx.db, f.feature_id, {
            phase: targetPhase as SpecFlowFeature["phase"],
            status: "pending",
            failure_count: 0,
            last_error: null,
            last_phase_error: null,
            current_session: null,
          });
          results.push({ id: f.feature_id, from: `${f.phase}/${f.status}`, to: `${targetPhase}/pending` });
        }

        if (ctx.options.json) {
          console.log(formatJson(results));
        } else {
          for (const r of results) {
            console.log(`Reset ${r.id}: ${r.from} → ${r.to}`);
          }
          console.log(`\n${results.length} feature(s) reset.`);
        }
      })
    );
}
