CREATE TABLE `ai_tool_keys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`toolId` int NOT NULL,
	`apiKeyEncrypted` text NOT NULL,
	`label` varchar(128),
	`isActive` boolean NOT NULL DEFAULT true,
	`failCount` int NOT NULL DEFAULT 0,
	`lastSuccessAt` int,
	`lastFailAt` int,
	`cooldownUntil` int,
	`successCount` int NOT NULL DEFAULT 0,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ai_tool_keys_id` PRIMARY KEY(`id`)
);
