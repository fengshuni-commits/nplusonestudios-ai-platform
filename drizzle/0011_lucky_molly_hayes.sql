ALTER TABLE `generation_history` ADD `enhancedImageUrl` text;--> statement-breakpoint
ALTER TABLE `generation_history` ADD `enhanceTaskId` varchar(128);--> statement-breakpoint
ALTER TABLE `generation_history` ADD `enhanceStatus` enum('idle','processing','done','failed') DEFAULT 'idle';--> statement-breakpoint
ALTER TABLE `generation_history` ADD `enhanceParams` json;