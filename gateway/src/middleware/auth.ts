import { createHash } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/sqlite.js";
import { apiKeys } from "../db/schema.js";

export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const key = req.headers["x-api-key"] as string | undefined;

  if (!key) {
    res.status(401).json({ error: "Missing x-api-key header" });
    return;
  }

  // Allow master key
  const masterKey = process.env.AIC_SECRET;
  if (masterKey && key === masterKey) {
    next();
    return;
  }

  // Look up hashed key in database
  const hash = hashKey(key);
  const found = db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.key_hash, hash))
    .get();

  if (!found) {
    res.status(401).json({ error: "Invalid API key" });
    return;
  }

  // Attach key info to request for downstream use
  (req as any).apiKeyId = found.id;
  next();
}
