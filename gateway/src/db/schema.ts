import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  slug: text("slug").unique().notNull(),
  name: text("name").notNull(),
  model: text("model").default("openai/gpt-4o-mini").notNull(),
  system_prompt: text("system_prompt").default("").notNull(),
  tools: text("tools", { mode: "json" }).$type<string[]>().default([]).notNull(),
  setup_script: text("setup_script").default("").notNull(),
  max_steps: integer("max_steps").default(20).notNull(),
  category: text("category").default("").notNull(),
  icon: text("icon").default("").notNull(),
  is_template: integer("is_template", { mode: "boolean" }).default(false).notNull(),
  created_at: text("created_at")
    .default(new Date().toISOString())
    .notNull(),
});

export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  key_hash: text("key_hash").unique().notNull(),
  key_prefix: text("key_prefix").notNull(),
  name: text("name").default("").notNull(),
  created_at: text("created_at")
    .default(new Date().toISOString())
    .notNull(),
});

export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  agent_id: text("agent_id")
    .references(() => agents.id)
    .notNull(),
  api_key_id: text("api_key_id").references(() => apiKeys.id),
  input: text("input").default("").notNull(),
  output: text("output").default("").notNull(),
  model: text("model").default("").notNull(),
  steps: integer("steps").default(0).notNull(),
  status: text("status", { enum: ["running", "succeeded", "failed"] })
    .default("running")
    .notNull(),
  started_at: text("started_at")
    .default(new Date().toISOString())
    .notNull(),
  finished_at: text("finished_at"),
  tokens_in: integer("tokens_in").default(0).notNull(),
  tokens_out: integer("tokens_out").default(0).notNull(),
  cost: real("cost").default(0).notNull(),
});
