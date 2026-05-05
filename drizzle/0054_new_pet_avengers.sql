CREATE TABLE `design_brief_prompts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('system','revise') NOT NULL,
	`label` varchar(128) NOT NULL,
	`prompt` longtext NOT NULL,
	`description` text,
	`updatedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `design_brief_prompts_id` PRIMARY KEY(`id`),
	CONSTRAINT `design_brief_prompts_type_unique` UNIQUE(`type`)
);
--> statement-breakpoint
CREATE TABLE `meeting_minutes_prompts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('system') NOT NULL,
	`label` varchar(128) NOT NULL,
	`prompt` longtext NOT NULL,
	`description` text,
	`updatedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `meeting_minutes_prompts_id` PRIMARY KEY(`id`),
	CONSTRAINT `meeting_minutes_prompts_type_unique` UNIQUE(`type`)
);
