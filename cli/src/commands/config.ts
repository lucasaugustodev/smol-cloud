import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import chalk from "chalk";

const SENSITIVE_KEYS = ["AIC_SECRET", "OPENROUTER_API_KEY", "AIC_API_KEY"];

function envPath(): string {
  return join(process.cwd(), ".env");
}

async function readEnv(): Promise<string> {
  try {
    return await readFile(envPath(), "utf-8");
  } catch {
    return "";
  }
}

function parseEnv(content: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    map.set(key, value);
  }
  return map;
}

export async function configSet(key: string, value: string) {
  const content = await readEnv();
  const lines = content.split("\n");
  let found = false;

  const updated = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) return line;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) return line;
    const lineKey = trimmed.slice(0, eqIdx).trim();
    if (lineKey === key) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });

  if (!found) {
    updated.push(`${key}=${value}`);
  }

  await writeFile(envPath(), updated.join("\n"), "utf-8");
  console.log(chalk.green(`  Set ${chalk.bold(key)} in .env`));
}

export async function configGet() {
  const content = await readEnv();
  if (!content.trim()) {
    console.log(chalk.dim("\n  No .env file found in current directory.\n"));
    return;
  }

  console.log(chalk.bold("\n  Configuration (.env):\n"));

  const entries = parseEnv(content);
  for (const [key, value] of entries) {
    const masked = SENSITIVE_KEYS.includes(key)
      ? value.slice(0, 6) + "..." + chalk.dim(" (masked)")
      : value;
    console.log(`  ${chalk.cyan(key)}=${masked}`);
  }
  console.log();
}
