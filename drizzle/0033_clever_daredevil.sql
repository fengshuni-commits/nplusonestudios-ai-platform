CREATE TABLE `analysis_image_jobs` (
	`id` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`type` enum('material','soft_furnishing') NOT NULL,
	`toolId` int,
	`referenceImageUrl` text NOT NULL,
	`fullPrompt` text,
	`status` enum('pending','processing','done','failed') NOT NULL DEFAULT 'pending',
	`resultUrl` text,
	`error` text,
	`historyId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `analysis_image_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `analysis_image_prompts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('material','soft_furnishing') NOT NULL,
	`label` varchar(128) NOT NULL,
	`prompt` text NOT NULL,
	`description` text,
	`updatedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `analysis_image_prompts_id` PRIMARY KEY(`id`),
	CONSTRAINT `analysis_image_prompts_type_unique` UNIQUE(`type`)
);
