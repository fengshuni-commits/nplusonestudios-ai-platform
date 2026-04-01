CREATE TABLE `graphic_layout_prompts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('layout_plan_system','image_generation') NOT NULL,
	`label` varchar(128) NOT NULL,
	`prompt` text NOT NULL,
	`description` text,
	`updatedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `graphic_layout_prompts_id` PRIMARY KEY(`id`),
	CONSTRAINT `graphic_layout_prompts_type_unique` UNIQUE(`type`)
);
