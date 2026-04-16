CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`model` text DEFAULT 'openai/gpt-4o-mini' NOT NULL,
	`system_prompt` text DEFAULT '' NOT NULL,
	`tools` text DEFAULT '[]' NOT NULL,
	`setup_script` text DEFAULT '' NOT NULL,
	`max_steps` integer DEFAULT 20 NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`icon` text DEFAULT '' NOT NULL,
	`is_template` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT '2026-04-16T06:04:20.714Z' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agents_slug_unique` ON `agents` (`slug`);--> statement-breakpoint
CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`key_hash` text NOT NULL,
	`key_prefix` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT '2026-04-16T06:04:20.716Z' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_key_hash_unique` ON `api_keys` (`key_hash`);--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`api_key_id` text,
	`input` text DEFAULT '' NOT NULL,
	`output` text DEFAULT '' NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`steps` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`started_at` text DEFAULT '2026-04-16T06:04:20.716Z' NOT NULL,
	`finished_at` text,
	`tokens_in` integer DEFAULT 0 NOT NULL,
	`tokens_out` integer DEFAULT 0 NOT NULL,
	`cost` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`api_key_id`) REFERENCES `api_keys`(`id`) ON UPDATE no action ON DELETE no action
);
