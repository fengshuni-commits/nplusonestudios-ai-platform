CREATE TABLE `project_custom_fields` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`fieldName` varchar(256) NOT NULL,
	`fieldValue` text,
	`sortOrder` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `project_custom_fields_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `generation_history` ADD `projectId` int;--> statement-breakpoint
ALTER TABLE `projects` ADD `companyProfile` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `businessGoal` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `clientProfile` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `projectOverview` text;