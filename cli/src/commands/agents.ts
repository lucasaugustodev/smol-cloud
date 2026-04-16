import chalk from "chalk";
import ora from "ora";
import { AICClient } from "../api-client.js";

function getClient(): AICClient {
  return new AICClient();
}

export async function agentsList() {
  const spinner = ora("Fetching agents...").start();
  try {
    const client = getClient();
    const agents = await client.listAgents();
    spinner.stop();

    if (agents.length === 0) {
      console.log(chalk.dim("\n  No agents found. Create one with:"));
      console.log(chalk.cyan("  agentsincloud agents create --name my-agent\n"));
      return;
    }

    console.log(chalk.bold(`\n  Agents (${agents.length}):\n`));

    // Table header
    const header = [
      "ID".padEnd(26),
      "Slug".padEnd(20),
      "Model".padEnd(28),
      "Steps".padEnd(6),
      "Template",
    ].join("  ");
    console.log(chalk.dim(`  ${header}`));
    console.log(chalk.dim(`  ${"─".repeat(header.length)}`));

    for (const a of agents) {
      const row = [
        a.id.padEnd(26),
        a.slug.padEnd(20),
        a.model.padEnd(28),
        String(a.max_steps).padEnd(6),
        a.is_template ? chalk.yellow("yes") : chalk.dim("no"),
      ].join("  ");
      console.log(`  ${row}`);
    }
    console.log();
  } catch (err: any) {
    spinner.fail(err.message);
    process.exit(1);
  }
}

export async function agentsCreate(opts: {
  name: string;
  model?: string;
  prompt?: string;
}) {
  const spinner = ora("Creating agent...").start();
  try {
    const client = getClient();
    const agent = await client.createAgent({
      name: opts.name,
      model: opts.model || "openai/gpt-4o-mini",
      system_prompt: opts.prompt || "",
    });
    spinner.succeed(`Agent created: ${chalk.bold(agent.slug)} (${agent.id})`);
    console.log(chalk.dim(`  Model: ${agent.model}`));
    console.log(chalk.dim(`  Run it: agentsincloud agents run ${agent.slug} --input "Hello"\n`));
  } catch (err: any) {
    spinner.fail(err.message);
    process.exit(1);
  }
}

export async function agentsRun(
  idOrSlug: string,
  opts: { input?: string; sync?: boolean },
) {
  const input = opts.input || "Hello";

  if (opts.sync) {
    const spinner = ora("Running agent (sync)...").start();
    try {
      const client = getClient();
      const run = await client.runAgentSync(idOrSlug, input);
      spinner.succeed(`Run ${run.id} — ${run.status}`);
      console.log(chalk.dim(`  Steps: ${run.steps} | Tokens: ${run.tokens_in}/${run.tokens_out}`));
      console.log(`\n${run.output}\n`);
    } catch (err: any) {
      spinner.fail(err.message);
      process.exit(1);
    }
    return;
  }

  // SSE streaming mode
  console.log(chalk.dim(`\n  Running agent ${chalk.bold(idOrSlug)}...\n`));
  try {
    const client = getClient();
    await client.runAgent(idOrSlug, input, (event) => {
      switch (event.event) {
        case "step":
          try {
            const step = JSON.parse(event.data);
            console.log(chalk.cyan(`  [step ${step.step || ""}] `) + (step.text || event.data));
          } catch {
            console.log(chalk.cyan("  [step] ") + event.data);
          }
          break;
        case "tool_call":
          try {
            const call = JSON.parse(event.data);
            console.log(chalk.yellow(`  [tool] ${call.tool || call.name || ""}`));
          } catch {
            console.log(chalk.yellow("  [tool] ") + event.data);
          }
          break;
        case "tool_result":
          console.log(chalk.dim("  [result] ") + event.data.slice(0, 200));
          break;
        case "final":
          console.log(chalk.green("\n  [final] ") + event.data);
          break;
        case "error":
          console.log(chalk.red("  [error] ") + event.data);
          break;
        default:
          console.log(chalk.dim(`  [${event.event}] `) + event.data);
      }
    });
    console.log();
  } catch (err: any) {
    console.error(chalk.red(`\n  Error: ${err.message}\n`));
    process.exit(1);
  }
}

export async function agentsDelete(idOrSlug: string) {
  const spinner = ora(`Deleting agent ${idOrSlug}...`).start();
  try {
    const client = getClient();
    await client.deleteAgent(idOrSlug);
    spinner.succeed(`Agent ${chalk.bold(idOrSlug)} deleted.`);
  } catch (err: any) {
    spinner.fail(err.message);
    process.exit(1);
  }
}
