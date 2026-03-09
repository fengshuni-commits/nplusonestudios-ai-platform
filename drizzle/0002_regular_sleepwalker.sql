CREATE TABLE `case_sources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(256) NOT NULL,
	`baseUrl` text NOT NULL,
	`description` text,
	`imageSelector` varchar(512),
	`titleSelector` varchar(512),
	`descSelector` varchar(512),
	`imageDomain` varchar(256),
	`preferredSize` varchar(64),
	`isActive` boolean DEFAULT true,
	`sortOrder` int DEFAULT 0,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `case_sources_id` PRIMARY KEY(`id`)
);
