CREATE TABLE `director_conversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`role` enum('user','assistant','tool') NOT NULL,
	`content` longtext NOT NULL,
	`toolCalls` json,
	`toolCallId` varchar(128),
	`workspaceItemId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `director_conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `director_workspace_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`type` enum('effect','plan','color_plan','analysis','other') NOT NULL DEFAULT 'other',
	`title` varchar(256),
	`imageUrl` text NOT NULL,
	`projectId` int,
	`conversationId` int,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `director_workspace_items_id` PRIMARY KEY(`id`)
);
