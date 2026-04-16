import chalk from "chalk";
import ora from "ora";
import { AICClient } from "../api-client.js";

export async function statusCommand() {
  const spinner = ora("Checking services...").start();

  const baseUrl = process.env.AIC_URL || "http://localhost:4000";
  const client = new AICClient();

  try {
    const health = await client.health();
    spinner.stop();

    console.log(chalk.bold("\n  Agents in Cloud — Status\n"));
    console.log(`  Gateway:    ${chalk.green("●")} ${chalk.green("online")}  ${chalk.dim(baseUrl)}`);

    if (health.version) {
      console.log(chalk.dim(`  Version:    ${health.version}`));
    }

    if (health.services) {
      for (const [name, info] of Object.entries(health.services)) {
        const ok = info.status === "ok" || info.status === "healthy";
        const indicator = ok ? chalk.green("●") : chalk.red("●");
        const label = ok ? chalk.green("online") : chalk.red("offline");
        console.log(`  ${name.padEnd(12)}${indicator} ${label}`);
      }
    }

    console.log();
  } catch (err: any) {
    spinner.stop();

    console.log(chalk.bold("\n  Agents in Cloud — Status\n"));
    console.log(`  Gateway:    ${chalk.red("●")} ${chalk.red("offline")}  ${chalk.dim(baseUrl)}`);
    console.log(chalk.dim(`  Error: ${err.message}`));
    console.log();
    console.log(chalk.dim("  Is the gateway running? Try:"));
    console.log(chalk.cyan("    docker compose up -d\n"));
    process.exit(1);
  }
}
