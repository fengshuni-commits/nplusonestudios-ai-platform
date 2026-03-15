CREATE TABLE `render_styles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`label` varchar(128) NOT NULL,
	`promptHint` text NOT NULL,
	`referenceImageUrl` text,
	`sortOrder` int NOT NULL DEFAULT 0,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `render_styles_id` PRIMARY KEY(`id`)
);
