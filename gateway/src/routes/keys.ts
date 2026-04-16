import { Router } from "express";
import { randomBytes } from "node:crypto";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { db } from "../db/sqlite.js";
import { apiKeys } from "../db/schema.js";
import { hashKey } from "../middleware/auth.js";

export const keysRouter = Router();

// POST / — create a new API key
keysRouter.post("/", async (req, res) => {
  try {
    const { name } = req.body || {};
    const raw = "aic_" + randomBytes(24).toString("hex");
    const prefix = raw.slice(0, 12) + "...";
    const hash = hashKey(raw);
    const id = nanoid();

    db.insert(apiKeys)
      .values({
        id,
        key_hash: hash,
        key_prefix: prefix,
        name: name || "",
        created_at: new Date().toISOString(),
      })
      .run();

    res.status(201).json({ id, key: raw, prefix, name: name || "" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET / — list all keys (no hash exposed)
keysRouter.get("/", async (_req, res) => {
  try {
    const keys = db
      .select({
        id: apiKeys.id,
        prefix: apiKeys.key_prefix,
        name: apiKeys.name,
        created_at: apiKeys.created_at,
      })
      .from(apiKeys)
      .all();

    res.json(keys);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:id — revoke a key
keysRouter.delete("/:id", async (req, res) => {
  try {
    const id = req.params.id as string;
    const result = db.delete(apiKeys).where(eq(apiKeys.id, id)).run();

    if (result.changes === 0) {
      res.status(404).json({ error: "Key not found" });
      return;
    }

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
