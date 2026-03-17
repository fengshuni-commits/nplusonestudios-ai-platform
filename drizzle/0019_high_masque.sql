CREATE TABLE `video_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`projectId` int,
	`toolId` int,
	`mode` enum('text-to-video','image-to-video') NOT NULL,
	`prompt` text NOT NULL,
	`duration` int NOT NULL,
	`inputImageUrl` text,
	`outputVideoUrl` text,
	`taskId` varchar(256),
	`status` enum('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
	`errorMessage` text,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `video_history_id` PRIMARY KEY(`id`)
);
