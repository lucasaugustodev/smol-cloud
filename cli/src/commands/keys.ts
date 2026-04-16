import chalk from "chalk";
import ora from "ora";
import { AICClient } from "../api-client.js";

function getClient(): AICClient {
  return new AICClient();
}

export async function keysList() {
  const spinner = ora("Fetching API keys...").start();
  try {
    const client = getClient();
    const keys = await client.listKeys();
    spinner.stop();

    if (keys.length === 0) {
      console.log(chalk.dim("\n  No API keys found. Create one with:"));
      console.log(chalk.cyan("  agentsincloud keys create --name my-key\n"));
      return;
    }

    console.log(chalk.bold(`\n  API Keys (${keys.length}):\n`));

    const header = [
      "ID".padEnd(26),
      "Prefix".padEnd(16),
      "Name".padEnd(20),
      "Created",
    ].join("  ");
    console.log(chalk.dim(`  ${header}`));
    console.log(chalk.dim(`  ${"─".repeat(header.length)}`));

    for (const k of keys) {
      const row = [
        k.id.padEnd(26),
        (k.key_prefix + "...").padEnd(16),
        (k.name || chalk.dim("(unnamed)")).padEnd(20),
        k.created_at.slice(0, 10),
      ].join("  ");
      console.log(`  ${row}`);
    }
    console.log();
  } catch (err: any) {
    spinner.fail(err.message);
    process.exit(1);
  }
}

export async function keysCreate(opts: { name?: string }) {
  const spinner = ora("Creating API key...").start();
  try {
    const client = getClient();
    const result = await client.createKey(opts.name);
    spinner.succeed("API key created");
    console.log();
    console.log(chalk.bold.green(`  ${result.raw_key}`));
    console.log();
    console.log(chalk.yellow("  Save this key now — it will not be shown again."));
    console.log(chalk.dim(`  ID: ${result.id}`));
    console.log(chalk.dim(`  Prefix: ${result.key_prefix}...`));
    console.log();
  } catch (err: any) {
    spinner.fail(err.message);
    process.exit(1);
  }
}

export async function keysRevoke(id: string) {
  const spinner = ora(`Revoking key ${id}...`).start();
  try {
    const client = getClient();
    await client.revokeKey(id);
    spinner.succeed(`Key ${chalk.bold(id)} revoked.`);
  } catch (err: any) {
    spinner.fail(err.message);
    process.exit(1);
  }
}
