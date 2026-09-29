ALTER TABLE `customers` ADD `blocked` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE TABLE `admin_tasks` (`id` text PRIMARY KEY NOT NULL,`title` text NOT NULL,`detail` text DEFAULT '' NOT NULL,`assignee_id` text,`created_by` text NOT NULL,`status` text DEFAULT 'open' NOT NULL,`due_date` text DEFAULT '' NOT NULL,`version` integer DEFAULT 1 NOT NULL,`created_at` text NOT NULL,`updated_at` text NOT NULL);--> statement-breakpoint
CREATE TABLE `admin_messages` (`id` text PRIMARY KEY NOT NULL,`author_id` text NOT NULL,`body` text NOT NULL,`created_at` text NOT NULL);
