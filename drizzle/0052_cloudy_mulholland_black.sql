CREATE TABLE `design_brief_inputs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`historyId` int NOT NULL,
	`inputType` enum('text','file','url','asset','document') NOT NULL,
	`textContent` text,
	`fileUrl` text,
	`label` varchar(512),
	`assetId` int,
	`documentId` int,
	`webUrl` text,
	`extractedText` longtext,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `design_brief_inputs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `design_briefs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int,
	`title` varchar(512) NOT NULL,
	`latestHistoryId` int,
	`currentVersion` int NOT NULL DEFAULT 1,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `design_briefs_id` PRIMARY KEY(`id`)
);
