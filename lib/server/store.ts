import { env } from "cloudflare:workers";
import { seedProducts } from "../catalog";
import type { AdminStoreSettings, Inquiry, Product, StoreSettings } from "../types";
import { RequestError } from "./validation";

export const defaultSettings: AdminStoreSettings = {
  email: "info@homeretreatdirect.com", phone: "+1 509-205-9501", country: "United States", currency: "USD",
  btcEnabled: true, usdtEnabled: true, btcConfigured: false, usdtConfigured: false,
  btcAddress: "", usdtAddress: "", usdtNetwork: "",
  shippingNote: "Delivery availability, shipping charges and any tax are confirmed in your written quote before payment.",
  returnsNote: "Ask for the return window, return shipping costs and applicable manufacturer warranty in your written quote before purchase.",
};

export function database(): D1Database {
  if (!env.DB) throw new RequestError("The store is being configured. Please contact us directly to request a quote.", 503);
  return env.DB;
}

export function publicSettings(settings: AdminStoreSettings): StoreSettings {
  const { btcAddress: _btc, usdtAddress: _usdt, usdtNetwork: _network, ...safe } = settings;
  return { ...safe, btcConfigured: settings.btcEnabled && Boolean(settings.btcAddress), usdtConfigured: settings.usdtEnabled && Boolean(settings.usdtAddress && settings.usdtNetwork) };
}

export async function readProducts(includeArchived = false): Promise<Product[]> {
  const db = database();
  const result = await db.prepare("SELECT data FROM product_records").all<{ data: string }>();
  const products = new Map(seedProducts.map(product => [product.id, product]));
  for (const row of result.results ?? []) {
    const product = JSON.parse(row.data) as Product;
    products.set(product.id, product);
  }
  return [...products.values()].filter(product => includeArchived || product.active);
}

export async function readSettings(): Promise<AdminStoreSettings> {
  const row = await database().prepare("SELECT data FROM store_settings WHERE id = ?").bind("store").first<{ data: string }>();
  return row ? { ...defaultSettings, ...JSON.parse(row.data) } : defaultSettings;
}

export async function saveProduct(product: Product): Promise<void> {
  await database().prepare("INSERT INTO product_records (id, slug, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET slug = excluded.slug, data = excluded.data, updated_at = excluded.updated_at")
    .bind(product.id, product.slug, JSON.stringify(product), new Date().toISOString()).run();
}

export async function saveSettings(settings: AdminStoreSettings): Promise<void> {
  await database().prepare("INSERT INTO store_settings (id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at")
    .bind("store", JSON.stringify(settings), new Date().toISOString()).run();
}

export async function readInquiries(): Promise<Inquiry[]> {
  const result = await database().prepare("SELECT data, status FROM inquiries ORDER BY created_at DESC LIMIT 200").all<{ data: string; status: Inquiry["status"] }>();
  return (result.results ?? []).map(row => ({ ...JSON.parse(row.data), status: row.status }));
}

export async function saveInquiry(inquiry: Inquiry): Promise<void> {
  await database().prepare("INSERT INTO inquiries (id, reference, data, status, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(inquiry.id, inquiry.reference, JSON.stringify(inquiry), inquiry.status, inquiry.createdAt).run();
}
