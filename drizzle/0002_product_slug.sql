ALTER TABLE `products` ADD `slug` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `seo_title` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `seo_description` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `products` SET `slug` = `id` WHERE `slug` = '';--> statement-breakpoint
CREATE UNIQUE INDEX `idx_products_slug` ON `products` (`slug`);
