CREATE TABLE `case_study_prompts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`phase` enum('keyword_extraction','case_selection','report_generation') NOT NULL,
	`label` varchar(128) NOT NULL,
	`prompt` text NOT NULL,
	`description` text,
	`updatedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `case_study_prompts_id` PRIMARY KEY(`id`),
	CONSTRAINT `case_study_phase_unique` UNIQUE(`phase`)
);
