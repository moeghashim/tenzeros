ALTER TABLE `chats` ADD `state` text DEFAULT '{"revision":0}' NOT NULL;--> statement-breakpoint
ALTER TABLE `imports` ADD `rows` text;--> statement-breakpoint
ALTER TABLE `imports` ADD `chat_id` text REFERENCES chats(id);