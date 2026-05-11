CREATE TABLE `presentation_assets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`presentationId` int NOT NULL,
	`fileUrl` text NOT NULL,
	`fileName` varchar(256),
	`mimeType` varchar(64),
	`sortOrder` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `presentation_assets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `presentation_projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`projectId` int,
	`title` varchar(256) NOT NULL,
	`description` text,
	`designThoughts` text,
	`targetPages` int DEFAULT 10,
	`status` enum('draft','prompts_ready','generating','review','done') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `presentation_projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `presentation_slides` (
	`id` int AUTO_INCREMENT NOT NULL,
	`presentationId` int NOT NULL,
	`slideOrder` int NOT NULL,
	`prompt` text,
	`imageUrl` text,
	`status` enum('pending','generating','done','error') NOT NULL DEFAULT 'pending',
	`textElements` json,
	`regenerateCount` int DEFAULT 0,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `presentation_slides_id` PRIMARY KEY(`id`)
);
