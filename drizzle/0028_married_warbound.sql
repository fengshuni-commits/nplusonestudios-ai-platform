CREATE TABLE `rendering_jobs` (
	`id` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`status` enum('pending','processing','done','failed') NOT NULL DEFAULT 'pending',
	`inputParams` json NOT NULL,
	`resultUrl` text,
	`resultPrompt` text,
	`error` text,
	`historyId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rendering_jobs_id` PRIMARY KEY(`id`)
);
