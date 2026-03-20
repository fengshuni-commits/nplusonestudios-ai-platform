CREATE TABLE `api_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(256) NOT NULL,
	`tokenHash` varchar(255) NOT NULL,
	`tokenPreview` varchar(20) NOT NULL,
	`type` enum('openclaw','webhook','general') NOT NULL DEFAULT 'general',
	`expiresAt` timestamp NOT NULL,
	`lastUsedAt` timestamp,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `api_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `api_tokens_tokenHash_unique` UNIQUE(`tokenHash`)
);
