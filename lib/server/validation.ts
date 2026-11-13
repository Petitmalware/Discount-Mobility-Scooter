import type { AdminStoreSettings, Currency, InquiryInput, Product } from "../types";

export class RequestError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

export const productCategories = ["travel", "folding", "3-wheel", "4-wheel", "heavy-duty", "outdoor"] as const;
function category(value: unknown): string {
  const key = text(value, "Category", 2, 60).toLowerCase().replaceAll(" ", "-");
  if (!(productCategories as readonly string[]).includes(key)) throw new RequestError("Choose a supported scooter category.");
  return key;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RequestError("Please check the submitted details.");
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, min = 0, max = 250): string {
  if (typeof value !== "string") throw new RequestError(`${label} is required.`);
  const clean = value.trim();
  if (clean.length < min || clean.length > max || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(clean)) throw new RequestError(`Please enter a valid ${label.toLowerCase()}.`);
  return clean;
}
function optional(value: unknown, label: string, max = 250) { return value === undefined ? "" : text(value, label, 0, max); }
function number(value: unknown, label: string, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new RequestError(`Please enter a valid ${label.toLowerCase()}.`);
  return value;
}
function url(value: unknown, label: string, local = false) {
  const clean = text(value, label, 1, 1500);
  if (local && /^\/(?:assets|images)\/[a-zA-Z0-9/_.-]+$/.test(clean) && !clean.includes("..")) return clean;
  try {
    const parsed = new URL(clean);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error();
    return parsed.href;
  } catch { throw new RequestError(`${label} must be a valid HTTPS URL.`); }
}
function email(value: unknown, allowEmpty = false) {
  const clean = text(value, "Email", allowEmpty ? 0 : 3, 254).toLowerCase();
  if ((!allowEmpty || clean) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new RequestError("Please enter a valid email address.");
  return clean;
}
export function validateInquiry(value: unknown): InquiryInput {
  const data = object(value);
  if (data.website) throw new RequestError("Unable to submit this request.");
  if (data.consent !== true) throw new RequestError("Please agree to be contacted about your request.");
  if (!["assisted", "btc", "usdt"].includes(String(data.paymentPreference))) throw new RequestError("Please choose a payment preference.");
  if (!Array.isArray(data.items) || !data.items.length || data.items.length > 20) throw new RequestError("Add between 1 and 20 different scooters to your request.");
  const seen = new Set<string>();
  const items = data.items.map((item: unknown) => {
    const row = object(item);
    const productId = text(row.productId, "Product", 1, 100);
    const quantity = number(row.quantity, "Quantity", 1, 5);
    if (!Number.isInteger(quantity) || seen.has(productId)) throw new RequestError("Each scooter can appear once, with a quantity from 1 to 5.");
    seen.add(productId);
    return { productId, quantity };
  });
  return {
    name: text(data.name, "Name", 2, 120), email: email(data.email),
    phone: optional(data.phone, "Phone", 40), postcode: optional(data.postcode, "Postal code", 24),
    message: optional(data.message, "Message", 2000),
    paymentPreference: data.paymentPreference as InquiryInput["paymentPreference"], items, consent: true,
  };
}
export function validateProduct(value: unknown, existingId?: string): Product {
  const data = object(value);
  const slug = text(data.slug, "Slug", 2, 100);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new RequestError("Slug must contain lowercase letters, numbers and single hyphens.");
  const price = Math.round(number(data.price, "Price", 50, 30000) * 100) / 100;
  const referencePrice = Math.round(number(data.referencePrice, "Reference price", price, 50000) * 100) / 100;
  if (!Array.isArray(data.categories) || data.categories.length < 1 || data.categories.length > 6) throw new RequestError("Select between 1 and 6 categories.");
  const mainCategory = category(data.category);
  const categories = [...new Set([mainCategory, ...data.categories.map(category)])];
  if (!["confirm", "available", "unavailable"].includes(String(data.availability))) throw new RequestError("Choose a valid availability status.");
  const image = url(data.image, "Product image", true);
  const images = Array.isArray(data.images) ? data.images.filter(v => typeof v === "string" && v.trim()).slice(0, 8).map(v => url(v, "Product image", true)) : [image];
  const checked = text(data.priceCheckedAt, "Price checked date", 10, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checked) || Number.isNaN(Date.parse(checked))) throw new RequestError("Use a price checked date in YYYY-MM-DD format.");
  return {
    id: existingId ?? `custom-${crypto.randomUUID()}`, slug,
    name: text(data.name, "Name", 2, 160), brand: text(data.brand, "Brand", 2, 80),
    category: mainCategory, categories, price, referencePrice,
    description: text(data.description, "Description", 10, 4000), image, images: [...new Set([image, ...images])].slice(0, 8),
    rangeMiles: number(data.rangeMiles, "Range", 0.1, 100), maxSpeedMph: number(data.maxSpeedMph, "Speed", 0.1, 25),
    capacityLb: number(data.capacityLb, "Weight capacity", 50, 1000),
    weightLb: data.weightLb === null || data.weightLb === "" ? null : number(data.weightLb, "Product weight", 1, 500),
    featured: data.featured === true, active: data.active === true,
    sourceUrl: url(data.sourceUrl, "Specification source"), priceCheckedAt: checked,
    availability: data.availability as Product["availability"],
  };
}
export function validateSettings(value: unknown): AdminStoreSettings {
  const data = object(value);
  if (!["USD", "CAD", "GBP", "EUR", "AUD"].includes(String(data.currency))) throw new RequestError("Choose a supported currency.");
  const btcAddress = optional(data.btcAddress, "BTC receiving address", 120);
  const usdtAddress = optional(data.usdtAddress, "USDT receiving address", 120);
  const usdtNetwork = optional(data.usdtNetwork, "USDT network", 60);
  if (btcAddress && !/^[A-Za-z0-9]{14,120}$/.test(btcAddress)) throw new RequestError("Enter the BTC address without spaces or a URI prefix.");
  if (usdtAddress && !/^[A-Za-z0-9]{14,120}$/.test(usdtAddress)) throw new RequestError("Enter the USDT address without spaces or a URI prefix.");
  return {
    email: email(data.email, true), phone: text(data.phone, "Phone", 0, 40),
    country: text(data.country, "Country", 2, 80), currency: data.currency as Currency,
    btcEnabled: data.btcEnabled === true, usdtEnabled: data.usdtEnabled === true,
    shippingNote: text(data.shippingNote, "Shipping information", 10, 1200),
    returnsNote: text(data.returnsNote, "Returns information", 10, 1200),
    btcAddress, usdtAddress, usdtNetwork,
    btcConfigured: data.btcEnabled === true && Boolean(btcAddress),
    usdtConfigured: data.usdtEnabled === true && Boolean(usdtAddress && usdtNetwork),
  };
}
