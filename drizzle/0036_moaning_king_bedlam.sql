CREATE TABLE `color_plan_prompts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('base','reference_prefix') NOT NULL,
	`label` varchar(128) NOT NULL,
	`prompt` text NOT NULL,
	`description` text,
	`updatedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `color_plan_prompts_id` PRIMARY KEY(`id`),
	CONSTRAINT `color_plan_prompts_type_unique` UNIQUE(`type`)
);
