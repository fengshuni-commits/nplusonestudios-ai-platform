CREATE TABLE `expense_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reportId` int NOT NULL,
	`expenseDate` timestamp NOT NULL,
	`category` enum('transport_local','transport_travel','office_supplies','meals','other') NOT NULL,
	`description` varchar(512) NOT NULL,
	`amount` int NOT NULL,
	`invoiceUrl` text,
	`invoiceFileName` varchar(256),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `expense_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `expense_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`submitterName` varchar(128),
	`projectId` int,
	`projectName` varchar(256),
	`purpose` varchar(512) NOT NULL,
	`periodStart` timestamp,
	`periodEnd` timestamp,
	`totalAmount` int NOT NULL DEFAULT 0,
	`status` enum('draft','submitted','approved','rejected') NOT NULL DEFAULT 'submitted',
	`reviewedBy` int,
	`reviewedAt` timestamp,
	`reviewNote` text,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `expense_reports_id` PRIMARY KEY(`id`)
);
