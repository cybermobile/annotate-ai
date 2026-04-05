CREATE TABLE `generatedImages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`stepNumber` int NOT NULL,
	`imageUrl` text NOT NULL,
	`imageKey` text NOT NULL,
	`width` int NOT NULL,
	`height` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `generatedImages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`url` text NOT NULL,
	`title` text,
	`aspectRatio` varchar(10) NOT NULL DEFAULT '4:5',
	`status` enum('pending','scraping','analyzing','generating','completed','failed') NOT NULL DEFAULT 'pending',
	`statusMessage` text,
	`scrapedData` json,
	`tutorialSteps` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`)
);
