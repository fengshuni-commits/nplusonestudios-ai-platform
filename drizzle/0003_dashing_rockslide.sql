CREATE TABLE `generation_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`module` varchar(64) NOT NULL,
	`title` varchar(512) NOT NULL,
	`summary` text,
	`inputParams` json,
	`outputUrl` text,
	`outputContent` text,
	`status` enum('success','failed','processing') NOT NULL DEFAULT 'success',
	`durationMs` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `generation_history_id` PRIMARY KEY(`id`)
);
