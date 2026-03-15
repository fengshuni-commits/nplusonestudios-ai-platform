CREATE TABLE `project_field_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`description` varchar(256),
	`sortOrder` int NOT NULL DEFAULT 0,
	`isDefault` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `project_field_templates_id` PRIMARY KEY(`id`)
);
