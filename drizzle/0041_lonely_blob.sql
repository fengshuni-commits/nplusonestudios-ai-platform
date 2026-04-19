CREATE TABLE `task_deliverable_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskId` int NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`deliverableType` enum('file_location','doc_link','upload') NOT NULL,
	`deliverableContent` text,
	`deliverableFileUrl` text,
	`deliverableFileName` varchar(512),
	`submittedAt` timestamp NOT NULL DEFAULT (now()),
	`submittedBy` int NOT NULL,
	`reviewStatus` enum('pending','approved','rejected') DEFAULT 'pending',
	`reviewComment` text,
	`reviewedAt` timestamp,
	`reviewedBy` int,
	CONSTRAINT `task_deliverable_history_id` PRIMARY KEY(`id`)
);
