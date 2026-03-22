ALTER TABLE `tasks` ADD `startDate` timestamp;--> statement-breakpoint
ALTER TABLE `tasks` ADD `progress` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `tasks` ADD `parentId` int;