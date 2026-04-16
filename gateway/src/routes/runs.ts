import { Router } from "express";
import { nanoid } from "nanoid";
import { eq, desc } from "drizzle-orm";
import { db } from "../db/sqlite.js";
import { agents, runs } from "../db/schema.js";
import { resolveAgent } from "./agents.js";

const ENGINE_URL = process.env.ENGINE_URL || "http://engine:8200";
const CONTAINERS_URL = process.env.CONTAINERS_URL || "http://containers:9090";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const AIC_SECRET = process.env.AIC_SECRET || "";

/**
 * Ensures a container named `aic-agent-{slug}` exists.
 * Checks via GET /containers, creates via POST /containers if missing.
 */
async function ensureContainer(slug: string): Promise<string> {
  const containerName = `aic-agent-${slug}`;

  try {
    const listRes = await fetch(`${CONTAINERS_URL}/containers`, {
      headers: { "x-api-key": AIC_SECRET },
    });

    if (listRes.ok) {
      const containers: any[] = await listRes.json();
      const exists = containers.some(
        (c: any) => c.name === containerName || c.Names?.includes(`/${containerName}`),
      );
      if (exists) return containerName;
    }
  } catch {
    // Fall through to create
  }

  const createRes = await fetch(`${CONTAINERS_URL}/containers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": AIC_SECRET,
    },
    body: JSON.stringify({ name: containerName }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Failed to create container: ${err}`);
  }

  return containerName;
}

// --- Agent run routes (mounted under /api/agents) ---
export const agentRunRouter = Router();

// POST /:idOrSlug/run — SSE streaming
agentRunRouter.post("/:idOrSlug/run", async (req, res) => {
  const agent = resolveAgent(req.params.idOrSlug as string);
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  const { input } = req.body || {};
  if (!input) {
    res.status(400).json({ error: "input is required" });
    return;
  }

  const runId = nanoid();
  const now = new Date().toISOString();

  db.insert(runs)
    .values({
      id: runId,
      agent_id: agent.id,
      api_key_id: (req as any).apiKeyId || null,
      input,
      model: agent.model,
      status: "running",
      started_at: now,
    })
    .run();

  let container: string;
  try {
    container = await ensureContainer(agent.slug);
  } catch (err: any) {
    db.update(runs)
      .set({ status: "failed", output: err.message, finished_at: new Date().toISOString() })
      .where(eq(runs.id, runId))
      .run();
    res.status(500).json({ error: err.message });
    return;
  }

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  try {
    const engineRes = await fetch(`${ENGINE_URL}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: OPENROUTER_API_KEY,
        model: agent.model,
        system_prompt: agent.system_prompt,
        input,
        container,
        tools: agent.tools,
        setup_script: agent.setup_script,
        max_steps: agent.max_steps,
      }),
    });

    if (!engineRes.ok || !engineRes.body) {
      const errText = await engineRes.text();
      db.update(runs)
        .set({ status: "failed", output: errText, finished_at: new Date().toISOString() })
        .where(eq(runs.id, runId))
        .run();
      res.write(`data: ${JSON.stringify({ error: errText })}\n\n`);
      res.end();
      return;
    }

    let accumulated = "";
    let steps = 0;
    let tokensIn = 0;
    let tokensOut = 0;

    const reader = engineRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const dataStr = line.slice(6);
          res.write(`data: ${dataStr}\n\n`);

          try {
            const data = JSON.parse(dataStr);
            if (data.event === "step.completed" || data.type === "step.completed") {
              steps++;
            }
            if (data.output) accumulated = data.output;
            if (data.final_answer) accumulated = data.final_answer;
            if (data.tokens_in) tokensIn = data.tokens_in;
            if (data.tokens_out) tokensOut = data.tokens_out;
          } catch {
            // Non-JSON event, just proxy
          }
        } else if (line.startsWith("event: ")) {
          res.write(`${line}\n`);
        } else if (line.trim()) {
          res.write(`${line}\n`);
        }
      }
    }

    // Update run record
    db.update(runs)
      .set({
        status: "succeeded",
        output: accumulated,
        steps,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        finished_at: new Date().toISOString(),
      })
      .where(eq(runs.id, runId))
      .run();
  } catch (err: any) {
    db.update(runs)
      .set({ status: "failed", output: err.message, finished_at: new Date().toISOString() })
      .where(eq(runs.id, runId))
      .run();
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  }

  res.end();
});

// POST /:idOrSlug/run/sync — Sync execution
agentRunRouter.post("/:idOrSlug/run/sync", async (req, res) => {
  const agent = resolveAgent(req.params.idOrSlug as string);
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  const { input } = req.body || {};
  if (!input) {
    res.status(400).json({ error: "input is required" });
    return;
  }

  const runId = nanoid();
  const now = new Date().toISOString();

  db.insert(runs)
    .values({
      id: runId,
      agent_id: agent.id,
      api_key_id: (req as any).apiKeyId || null,
      input,
      model: agent.model,
      status: "running",
      started_at: now,
    })
    .run();

  let container: string;
  try {
    container = await ensureContainer(agent.slug);
  } catch (err: any) {
    db.update(runs)
      .set({ status: "failed", output: err.message, finished_at: new Date().toISOString() })
      .where(eq(runs.id, runId))
      .run();
    res.status(500).json({ error: err.message });
    return;
  }

  try {
    const engineRes = await fetch(`${ENGINE_URL}/run/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: OPENROUTER_API_KEY,
        model: agent.model,
        system_prompt: agent.system_prompt,
        input,
        container,
        tools: agent.tools,
        setup_script: agent.setup_script,
        max_steps: agent.max_steps,
      }),
    });

    const result = await engineRes.json();

    const status = engineRes.ok ? "succeeded" : "failed";
    db.update(runs)
      .set({
        status,
        output: result.output || result.final_answer || JSON.stringify(result),
        steps: result.steps || 0,
        tokens_in: result.tokens_in || 0,
        tokens_out: result.tokens_out || 0,
        finished_at: new Date().toISOString(),
      })
      .where(eq(runs.id, runId))
      .run();

    res.status(engineRes.ok ? 200 : 500).json({ run_id: runId, ...result });
  } catch (err: any) {
    db.update(runs)
      .set({ status: "failed", output: err.message, finished_at: new Date().toISOString() })
      .where(eq(runs.id, runId))
      .run();
    res.status(500).json({ error: err.message });
  }
});

// --- Runs history routes (mounted at /api/runs) ---
export const runsHistoryRouter = Router();

// GET / — list recent runs
runsHistoryRouter.get("/", async (_req, res) => {
  try {
    const recent = db
      .select()
      .from(runs)
      .orderBy(desc(runs.started_at))
      .limit(50)
      .all();
    res.json(recent);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id — get run details
runsHistoryRouter.get("/:id", async (req, res) => {
  try {
    const run = db
      .select()
      .from(runs)
      .where(eq(runs.id, req.params.id as string))
      .get();

    if (!run) {
      res.status(404).json({ error: "Run not found" });
      return;
    }
    res.json(run);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
