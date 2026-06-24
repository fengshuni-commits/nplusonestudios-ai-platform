ALTER TABLE `expense_items` ADD `didiTripReceiptUrl` text;--> statement-breakpoint
ALTER TABLE `expense_items` ADD `didiTripReceiptFileName` varchar(256);--> statement-breakpoint
ALTER TABLE `expense_reports` ADD `payeeName` varchar(128);