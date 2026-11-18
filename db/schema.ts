import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";

export const productRecords = sqliteTable("product_records", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  data: text("data").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const storeSettings = sqliteTable("store_settings", {
  id: text("id").primaryKey(),
  data: text("data").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const inquiries = sqliteTable("inquiries", {
  id: text("id").primaryKey(),
  reference: text("reference").notNull().unique(),
  data: text("data").notNull(),
  status: text("status").notNull().default("new"),
  createdAt: text("created_at").notNull(),
}, (table) => [index("inquiries_created_idx").on(table.createdAt)]);

export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  expiresAt: integer("expires_at").notNull(),
}, (table) => [index("rate_limits_expiry_idx").on(table.expiresAt)]);

export const orderDocuments = sqliteTable("order_documents", {
  id: text("id").primaryKey(), inquiryId: text("inquiry_id").notNull(), kind: text("kind").notNull(),
  data: text("data").notNull(), totalCents: integer("total_cents").notNull(), status: text("status").notNull().default("draft"), createdAt: text("created_at").notNull(),
}, table => [index("order_documents_inquiry_idx").on(table.inquiryId, table.createdAt)]);

export const paymentRecords = sqliteTable("payment_records", {
  id: text("id").primaryKey(), inquiryId: text("inquiry_id").notNull(), invoiceId: text("invoice_id").notNull(),
  referenceKey: text("reference_key").notNull(), amountCents: integer("amount_cents").notNull(), data: text("data").notNull(), createdAt: text("created_at").notNull(),
}, table => [uniqueIndex("payment_invoice_reference_unique").on(table.invoiceId, table.referenceKey), index("payment_records_inquiry_idx").on(table.inquiryId)]);

export const emailMessages = sqliteTable("email_messages", {
  id: text("id").primaryKey(), inquiryId: text("inquiry_id").notNull(), documentId: text("document_id"),
  data: text("data").notNull(), status: text("status").notNull().default("queued"), attempts: integer("attempts").notNull().default(0),
  providerId: text("provider_id"), lastError: text("last_error"), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, table => [index("email_messages_inquiry_idx").on(table.inquiryId, table.createdAt)]);
