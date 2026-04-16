#!/usr/bin/env node

import { Command } from "commander";
import { initCommand } from "../src/commands/init.js";
import { agentsList, agentsCreate, agentsRun, agentsDelete } from "../src/commands/agents.js";
import { keysList, keysCreate, keysRevoke } from "../src/commands/keys.js";
import { configSet, configGet } from "../src/commands/config.js";
import { statusCommand } from "../src/commands/status.js";
import { execSync } from "node:child_process";

const program = new Command();

program
  .name("agentsincloud")
  .description("Agents in Cloud CLI — AI agent infrastructure in one command")
  .version("0.1.0");

// ── init ───────────────────────────────────────────────

program
  .command("init")
  .description("Initialize a new Agents in Cloud project")
  .option("-y, --yes", "Skip prompts, use defaults")
  .action((opts) => initCommand(opts));

// ── agents ─────────────────────────────────────────────

const agents = program
  .command("agents")
  .description("Manage agents");

agents
  .command("list")
  .description("List all agents")
  .action(() => agentsList());

agents
  .command("create")
  .description("Create a new agent")
  .requiredOption("--name <name>", "Agent name")
  .option("--model <model>", "Model to use", "openai/gpt-4o-mini")
  .option("--prompt <prompt>", "System prompt")
  .action((opts) => agentsCreate(opts));

agents
  .command("run <id>")
  .description("Run an agent")
  .option("--input <input>", "Input message", "Hello")
  .option("--sync", "Wait for full response instead of streaming")
  .action((id, opts) => agentsRun(id, opts));

agents
  .command("delete <id>")
  .description("Delete an agent")
  .action((id) => agentsDelete(id));

// ── keys ───────────────────────────────────────────────

const keys = program
  .command("keys")
  .description("Manage API keys");

keys
  .command("list")
  .description("List API keys")
  .action(() => keysList());

keys
  .command("create")
  .description("Create a new API key")
  .option("--name <name>", "Key name")
  .action((opts) => keysCreate(opts));

keys
  .command("revoke <id>")
  .description("Revoke an API key")
  .action((id) => keysRevoke(id));

// ── config ─────────────────────────────────────────────

const config = program
  .command("config")
  .description("Manage configuration");

config
  .command("set <key> <value>")
  .description("Set a config value in .env")
  .action((key, value) => configSet(key, value));

config
  .command("get")
  .description("Show current configuration")
  .action(() => configGet());

// ── status ─────────────────────────────────────────────

program
  .command("status")
  .description("Check service health")
  .action(() => statusCommand());

// ── logs ───────────────────────────────────────────────

program
  .command("logs")
  .description("View service logs")
  .option("-f, --follow", "Follow log output")
  .option("-s, --service <service>", "Filter by service name")
  .action((opts) => {
    const args = ["docker", "compose", "logs"];
    if (opts.follow) args.push("-f");
    if (opts.service) args.push(opts.service);
    try {
      execSync(args.join(" "), { stdio: "inherit" });
    } catch {
      // docker compose exits with non-zero on Ctrl-C, that's fine
    }
  });

program.parse();
