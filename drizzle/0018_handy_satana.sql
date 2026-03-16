CREATE TABLE `ai_tool_defaults` (
	`id` int AUTO_INCREMENT NOT NULL,
	`capability` varchar(64) NOT NULL,
	`toolId` int NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ai_tool_defaults_id` PRIMARY KEY(`id`),
	CONSTRAINT `ai_tool_defaults_capability_unique` UNIQUE(`capability`)
);
--> statement-breakpoint
ALTER TABLE `assets` ADD `historyId` int;--> statement-breakpoint
ALTER TABLE `assets` ADD `projectId` int;--> statement-breakpoint
ALTER TABLE `assets` ADD `parentId` int;--> statement-breakpoint
ALTER TABLE `assets` ADD `isFolder` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `assets` ADD `path` varchar(1024);