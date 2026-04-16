import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import express from "express";
import { nanoid } from "nanoid";
import { db } from "./db/sqlite.js";
import { agents } from "./db/schema.js";
import { authMiddleware } from "./middleware/auth.js";
import { healthRouter } from "./routes/health.js";
import { agentsRouter } from "./routes/agents.js";
import { keysRouter } from "./routes/keys.js";
import { agentRunRouter, runsHistoryRouter } from "./routes/runs.js";

const PORT = parseInt(process.env.PORT || "4000", 10);

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function seedTemplates(): void {
  const templatesDir = "/app/templates";
  if (!existsSync(templatesDir)) {
    console.log("[gateway] Templates directory not found, skipping seed");
    return;
  }

  // Only seed if agents table is empty
  const count = db.select().from(agents).all();
  if (count.length > 0) {
    console.log(`[gateway] Agents table has ${count.length} rows, skipping seed`);
    return;
  }

  const files = readdirSync(templatesDir).filter((f) => f.endsWith(".json"));
  console.log(`[gateway] Seeding ${files.length} templates...`);

  for (const file of files) {
    try {
      const raw = readFileSync(join(templatesDir, file), "utf-8");
      const tpl = JSON.parse(raw);

      db.insert(agents)
        .values({
          id: nanoid(),
          slug: tpl.slug || slugify(tpl.name),
          name: tpl.name,
          model: tpl.model || "openai/gpt-4o-mini",
          system_prompt: tpl.system_prompt || "",
          tools: tpl.tools || [],
          setup_script: tpl.setup_script || "",
          max_steps: tpl.max_steps ?? 20,
          category: tpl.category || "",
          icon: tpl.icon || "",
          is_template: true,
          created_at: new Date().toISOString(),
        })
        .run();

      console.log(`  [seed] ${tpl.name} (${tpl.slug || slugify(tpl.name)})`);
    } catch (err) {
      console.error(`  [seed] Failed to seed ${file}:`, err);
    }
  }
}

const app = express();

// Body parser
app.use(express.json({ limit: "10mb" }));

// CORS
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key, Authorization");
  if (_req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

// Routes — no auth
app.use("/api/health", healthRouter);

// Routes — auth required
app.use("/api/agents", authMiddleware, agentsRouter);
app.use("/api/agents", authMiddleware, agentRunRouter);
app.use("/api/keys", authMiddleware, keysRouter);
app.use("/api/runs", authMiddleware, runsHistoryRouter);

// Seed templates on startup
seedTemplates();

app.listen(PORT, () => {
  console.log(`[gateway] Running on port ${PORT}`);
});
