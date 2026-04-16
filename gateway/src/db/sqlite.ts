import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

const dbPath = process.env.DATABASE_PATH || "./agentsincloud.db";
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

// Create tables if they don't exist
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    model TEXT NOT NULL DEFAULT 'openai/gpt-4o-mini',
    system_prompt TEXT NOT NULL DEFAULT '',
    tools TEXT NOT NULL DEFAULT '[]',
    setup_script TEXT NOT NULL DEFAULT '',
    max_steps INTEGER NOT NULL DEFAULT 20,
    category TEXT NOT NULL DEFAULT '',
    icon TEXT NOT NULL DEFAULT '',
    is_template INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    key_hash TEXT UNIQUE NOT NULL,
    key_prefix TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES agents(id),
    api_key_id TEXT REFERENCES api_keys(id),
    input TEXT NOT NULL DEFAULT '',
    output TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    steps INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'running',
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at TEXT,
    tokens_in INTEGER NOT NULL DEFAULT 0,
    tokens_out INTEGER NOT NULL DEFAULT 0,
    cost REAL NOT NULL DEFAULT 0
  );
`);

export const db = drizzle(sqlite, { schema });
export { sqlite };
