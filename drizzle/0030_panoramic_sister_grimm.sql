CREATE TABLE `layout_packs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(256) NOT NULL,
	`description` text,
	`sourceType` enum('pptx','images','pdf') NOT NULL,
	`sourceFileUrl` text,
	`sourceFileKey` text,
	`status` enum('pending','processing','done','failed') NOT NULL DEFAULT 'pending',
	`errorMessage` text,
	`styleGuide` json,
	`thumbnails` json,
	`layouts` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `layout_packs_id` PRIMARY KEY(`id`)
);
