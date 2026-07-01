CREATE TABLE `expense_item_changes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`itemId` int NOT NULL,
	`reportId` int NOT NULL,
	`changedBy` int NOT NULL,
	`changedByName` varchar(128),
	`fieldName` varchar(64) NOT NULL,
	`oldValue` varchar(256),
	`newValue` varchar(256),
	`changedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `expense_item_changes_id` PRIMARY KEY(`id`)
);
