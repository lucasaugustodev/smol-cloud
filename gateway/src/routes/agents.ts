import { Router } from "express";
import { nanoid } from "nanoid";
import { eq, or } from "drizzle-orm";
import { db } from "../db/sqlite.js";
import { agents } from "../db/schema.js";

export const agentsRouter = Router();

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolveAgent(idOrSlug: string) {
  return db
    .select()
    .from(agents)
    .where(or(eq(agents.id, idOrSlug), eq(agents.slug, idOrSlug)))
    .get();
}

// GET / — list all agents
agentsRouter.get("/", async (_req, res) => {
  try {
    const all = db.select().from(agents).all();
    res.json(all);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST / — create agent
agentsRouter.post("/", async (req, res) => {
  try {
    const { name, model, system_prompt, tools, setup_script, max_steps, category, icon } =
      req.body || {};

    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    let slug = slugify(name);

    // Ensure slug uniqueness
    let existing = db.select().from(agents).where(eq(agents.slug, slug)).get();
    let suffix = 1;
    while (existing) {
      slug = `${slugify(name)}-${suffix}`;
      existing = db.select().from(agents).where(eq(agents.slug, slug)).get();
      suffix++;
    }

    const id = nanoid();
    const now = new Date().toISOString();

    db.insert(agents)
      .values({
        id,
        slug,
        name,
        model: model || "openai/gpt-4o-mini",
        system_prompt: system_prompt || "",
        tools: tools || [],
        setup_script: setup_script || "",
        max_steps: max_steps ?? 20,
        category: category || "",
        icon: icon || "",
        is_template: false,
        created_at: now,
      })
      .run();

    const agent = db.select().from(agents).where(eq(agents.id, id)).get();
    res.status(201).json(agent);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:idOrSlug — get agent by id or slug
agentsRouter.get("/:idOrSlug", async (req, res) => {
  try {
    const agent = resolveAgent(req.params.idOrSlug as string);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    res.json(agent);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:idOrSlug — update agent
agentsRouter.put("/:idOrSlug", async (req, res) => {
  try {
    const agent = resolveAgent(req.params.idOrSlug as string);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const allowed = [
      "name",
      "model",
      "system_prompt",
      "tools",
      "setup_script",
      "max_steps",
      "category",
      "icon",
    ] as const;

    const updates: Record<string, any> = {};
    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length > 0) {
      db.update(agents).set(updates).where(eq(agents.id, agent.id)).run();
    }

    const updated = db.select().from(agents).where(eq(agents.id, agent.id)).get();
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:idOrSlug — delete agent
agentsRouter.delete("/:idOrSlug", async (req, res) => {
  try {
    const agent = resolveAgent(req.params.idOrSlug as string);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    db.delete(agents).where(eq(agents.id, agent.id)).run();
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export { resolveAgent };
