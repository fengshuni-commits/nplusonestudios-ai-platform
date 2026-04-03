ALTER TABLE `color_plan_prompts` DROP INDEX `color_plan_prompts_type_unique`;--> statement-breakpoint
ALTER TABLE `color_plan_prompts` ADD `style` enum('colored','hand_drawn','line_drawing') DEFAULT 'colored' NOT NULL;--> statement-breakpoint
ALTER TABLE `color_plan_prompts` ADD CONSTRAINT `style_type_unique` UNIQUE(`style`,`type`);