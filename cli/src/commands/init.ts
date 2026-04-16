import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import chalk from "chalk";
import inquirer from "inquirer";

export async function initCommand(opts: { yes?: boolean }) {
  console.log(chalk.bold("\n🚀 Agents in Cloud — Project Init\n"));

  let port = 4000;
  let openrouterKey = "";

  if (!opts.yes) {
    const answers = await inquirer.prompt([
      {
        type: "input",
        name: "port",
        message: "Gateway port:",
        default: "4000",
        validate: (v: string) => {
          const n = parseInt(v, 10);
          return n > 0 && n < 65536 ? true : "Enter a valid port number";
        },
      },
      {
        type: "password",
        name: "openrouterKey",
        message: "OpenRouter API key (optional, press Enter to skip):",
        mask: "*",
      },
    ]);
    port = parseInt(answers.port, 10);
    openrouterKey = answers.openrouterKey || "";
  }

  const projectDir = join(process.cwd(), "agentsincloud");
  const secret = randomBytes(32).toString("hex");

  console.log(chalk.dim(`\nCreating project in ${projectDir}...\n`));

  // Create directories
  await mkdir(projectDir, { recursive: true });
  await mkdir(join(projectDir, "tools"), { recursive: true });

  // Write .env
  const envContent = [
    `# Agents in Cloud — generated ${new Date().toISOString()}`,
    `AIC_PORT=${port}`,
    `AIC_SECRET=${secret}`,
    openrouterKey ? `OPENROUTER_API_KEY=${openrouterKey}` : `# OPENROUTER_API_KEY=sk-or-...`,
    "",
  ].join("\n");

  await writeFile(join(projectDir, ".env"), envContent, "utf-8");

  // Write docker-compose.yml
  const composeContent = `# Agents in Cloud — docker-compose.yml
services:
  engine:
    image: agentsincloud/engine:latest
    ports:
      - "8200:8200"
    environment:
      - CLOUD_API_URL=http://containers:9090
      - CLOUD_API_SECRET=\${AIC_SECRET}
      - SMOLAGENT_PORT=8200
    volumes:
      - ./tools:/app/custom_tools
    depends_on:
      containers:
        condition: service_healthy
    restart: unless-stopped

  gateway:
    image: agentsincloud/gateway:latest
    ports:
      - "\${AIC_PORT:-4000}:4000"
    environment:
      - ENGINE_URL=http://engine:8200
      - CONTAINERS_URL=http://containers:9090
      - AIC_SECRET=\${AIC_SECRET}
      - OPENROUTER_API_KEY=\${OPENROUTER_API_KEY}
      - DATABASE_PATH=/data/agentsincloud.db
    volumes:
      - aic-data:/data
    depends_on:
      engine:
        condition: service_healthy
    restart: unless-stopped

  containers:
    image: agentsincloud/containers:latest
    ports:
      - "9090:9090"
    environment:
      - AIC_SECRET=\${AIC_SECRET}
      - CONTAINERS_PORT=9090
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:9090/health"]
      interval: 5s
      timeout: 3s
      retries: 3
    restart: unless-stopped

  chat:
    image: agentsincloud/chat:latest
    ports:
      - "3000:80"
    depends_on:
      - gateway
    restart: unless-stopped

volumes:
  aic-data:
`;

  await writeFile(join(projectDir, "docker-compose.yml"), composeContent, "utf-8");

  // Print instructions
  console.log(chalk.green("  Project created successfully!\n"));
  console.log(chalk.bold("  Next steps:\n"));
  console.log(`    ${chalk.cyan("cd")} agentsincloud`);
  console.log(`    ${chalk.cyan("docker compose up -d")}`);
  console.log(`    ${chalk.cyan("agentsincloud status")}\n`);
  console.log(chalk.dim(`  Secret: ${secret.slice(0, 8)}... (saved in .env)`));
  console.log(chalk.dim(`  Gateway will be at http://localhost:${port}\n`));
}
