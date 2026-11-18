CREATE TABLE `email_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`inquiry_id` text NOT NULL,
	`document_id` text,
	`data` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`provider_id` text,
	`last_error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `email_messages_inquiry_idx` ON `email_messages` (`inquiry_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `order_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`inquiry_id` text NOT NULL,
	`kind` text NOT NULL,
	`data` text NOT NULL,
	`total_cents` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `order_documents_inquiry_idx` ON `order_documents` (`inquiry_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `payment_records` (
	`id` text PRIMARY KEY NOT NULL,
	`inquiry_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`reference_key` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`data` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_invoice_reference_unique` ON `payment_records` (`invoice_id`,`reference_key`);--> statement-breakpoint
CREATE INDEX `payment_records_inquiry_idx` ON `payment_records` (`inquiry_id`);