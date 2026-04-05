CREATE TABLE `brandSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`brandName` varchar(255),
	`accentColor` varchar(7) NOT NULL DEFAULT '#EC4899',
	`bgColor` varchar(7) NOT NULL DEFAULT '#1A1A2E',
	`textColor` varchar(7) NOT NULL DEFAULT '#FFFFFF',
	`logoUrl` text,
	`logoKey` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `brandSettings_id` PRIMARY KEY(`id`),
	CONSTRAINT `brandSettings_userId_unique` UNIQUE(`userId`)
);
