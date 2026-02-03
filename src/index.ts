#!/usr/bin/env bun

import { Command } from "commander";
import { createContext, type GlobalOptions } from "./context";
import { registerAgentCommands } from "./commands/agent";
import { registerProjectCommands } from "./commands/project";
import { registerWorkCommands } from "./commands/work";
import { registerObserveCommand } from "./commands/observe";
import { registerServeCommand } from "./commands/serve";
import { registerSweepCommand } from "./commands/sweep";
import { registerStatusCommand } from "./commands/status";

const pkg = require("../package.json");

const program = new Command()
  .name("blackboard")
  .version(pkg.version)
  .description(
    "Local Agent Blackboard — SQLite-based multi-agent coordination"
  )
  .option("-j, --json", "Output as JSON", false)
  .option("--db <path>", "Database path (overrides all resolution)");

// Lazy context getter — opens database on first command that needs it
function getContext() {
  const opts = program.opts() as GlobalOptions;
  return createContext(opts);
}

// Register all command groups
registerAgentCommands(program, getContext);
registerProjectCommands(program, getContext);
registerWorkCommands(program, getContext);
registerObserveCommand(program, getContext);
registerServeCommand(program, getContext);
registerSweepCommand(program, getContext);
registerStatusCommand(program, getContext);

program.parse();
