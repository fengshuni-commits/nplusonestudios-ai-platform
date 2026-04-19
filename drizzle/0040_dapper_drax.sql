ALTER TABLE `tasks` ADD `deliverableType` enum('file_location','doc_link','upload');--> statement-breakpoint
ALTER TABLE `tasks` ADD `deliverableContent` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `deliverableFileUrl` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `deliverableFileName` varchar(512);--> statement-breakpoint
ALTER TABLE `tasks` ADD `deliverableSubmittedAt` timestamp;--> statement-breakpoint
ALTER TABLE `tasks` ADD `reviewStatus` enum('pending','approved','rejected');--> statement-breakpoint
ALTER TABLE `tasks` ADD `reviewComment` text;