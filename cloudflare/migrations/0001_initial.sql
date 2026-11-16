CREATE TABLE `domains` (
	`id` text PRIMARY KEY NOT NULL,
	`origin` text NOT NULL,
	`host` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`is_default` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `domains_origin_unique` ON `domains` (`origin`);--> statement-breakpoint
CREATE UNIQUE INDEX `domains_host_unique` ON `domains` (`host`);--> statement-breakpoint
CREATE TABLE `links` (
	`id` text PRIMARY KEY NOT NULL,
	`domain_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`target` text NOT NULL,
	`mode` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`domain_id`) REFERENCES `domains`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `domain_slug_unique` ON `links` (`domain_id`,`slug`);--> statement-breakpoint
CREATE INDEX `links_owner` ON `links` (`owner_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `visits` (
	`id` text PRIMARY KEY NOT NULL,
	`link_id` text NOT NULL,
	`browser` text NOT NULL,
	`day` text NOT NULL,
	`timestamp` integer NOT NULL,
	FOREIGN KEY (`link_id`) REFERENCES `links`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `visit_day` ON `visits` (`day`);--> statement-breakpoint
CREATE INDEX `visit_dedup` ON `visits` (`link_id`,`browser`,`timestamp`);

CREATE TABLE accounts (user_id TEXT PRIMARY KEY REFERENCES users(id), username TEXT NOT NULL UNIQUE, password TEXT NOT NULL);
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
CREATE INDEX sessions_expiry ON sessions(expires);
CREATE TABLE auth_limits (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE INDEX auth_limits_expiry ON auth_limits(expires);
