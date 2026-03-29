CREATE TABLE `graphic_layout_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`packId` int,
	`docType` enum('brand_manual','product_detail','project_board','custom') NOT NULL,
	`pageCount` int NOT NULL DEFAULT 1,
	`contentText` text NOT NULL,
	`assetUrls` json,
	`title` varchar(256),
	`status` enum('pending','processing','done','failed') NOT NULL DEFAULT 'pending',
	`errorMessage` text,
	`pages` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `graphic_layout_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `graphic_style_packs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(256) NOT NULL,
	`sourceType` enum('images','pdf') NOT NULL,
	`sourceFileUrl` text,
	`sourceFileKey` text,
	`status` enum('pending','processing','done','failed') NOT NULL DEFAULT 'pending',
	`errorMessage` text,
	`styleGuide` json,
	`thumbnails` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `graphic_style_packs_id` PRIMARY KEY(`id`)
);
