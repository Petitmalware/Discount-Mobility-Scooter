import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

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
