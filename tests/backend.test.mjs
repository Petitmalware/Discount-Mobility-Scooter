import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

// Compile pure boundary helpers in memory so these checks do not need a Worker,
// network access or a test database and exercise the same authored functions.
const moduleUrl = async (path, replacements = {}) => {
  let source = stripTypeScriptTypes(await fs.readFile(new URL(path, import.meta.url), "utf8"));
  for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(from, to);
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
};
const validationUrl = await moduleUrl("../lib/server/validation.ts");
const { validateInquiry, validateProduct, validateSettings, RequestError } = await import(validationUrl);
const requestUrl = await moduleUrl("../lib/server/request.ts", { '"./validation"': JSON.stringify(validationUrl) });
const { readJson } = await import(requestUrl);
const quoteUrl = await moduleUrl("../lib/server/quote.ts", { '"./validation"': JSON.stringify(validationUrl) });
const { quoteItems } = await import(quoteUrl);
const { adminPolicy } = await import(await moduleUrl("../lib/server/auth-policy.ts"));
const goodInquiry = { name: "Alex Rider", email: "alex@example.com", paymentPreference: "assisted", items: [{ productId: "travel", quantity: 1 }], consent: true };
const product = { id: "travel", name: "Travel scooter", price: 649.99, active: true, availability: "confirm" };

test("admin access fails closed and requires an exact allowlisted email", () => {
  assert.deepEqual(adminPolicy("owner@example.com", ""), { configured: false, authorized: false });
  assert.equal(adminPolicy(null, "owner@example.com").authorized, false);
  assert.equal(adminPolicy("owner@example.com.attacker.test", "owner@example.com").authorized, false);
  assert.equal(adminPolicy("attacker@example.com", "owner@example.com").authorized, false);
  assert.equal(adminPolicy("OWNER@EXAMPLE.COM", " owner@example.com , other@example.com ").authorized, true);
});

test("validates contact and consent before an inquiry is saved", () => {
  assert.equal(validateInquiry(goodInquiry).email, "alex@example.com");
  assert.throws(() => validateInquiry({ ...goodInquiry, email: "bad\n@example.com" }), RequestError);
  assert.throws(() => validateInquiry({ ...goodInquiry, consent: false }), RequestError);
  assert.throws(() => validateInquiry({ ...goodInquiry, website: "spam.example" }), RequestError);
});
test("rejects duplicate IDs, fractional and oversized quantities", () => {
  assert.throws(() => validateInquiry({ ...goodInquiry, items: [{ productId: "travel", quantity: 1 }, { productId: "travel", quantity: 1 }] }), RequestError);
  for (const quantity of [-1, 0, 1.5, 6]) assert.throws(() => validateInquiry({ ...goodInquiry, items: [{ productId: "travel", quantity }] }), RequestError);
});
test("prices are authoritative and unavailable or archived products cannot be quoted", () => {
  const validated = validateInquiry({ ...goodInquiry, subtotal: 0.01, items: [{ productId: "travel", quantity: 3, unitPrice: 0.01 }] });
  const quote = quoteItems(validated.items, [product]);
  assert.equal(quote.items[0].unitPrice, 649.99);
  assert.equal(quote.subtotal, 1949.97);
  assert.throws(() => quoteItems(validated.items, [{ ...product, active: false }]), RequestError);
  assert.throws(() => quoteItems(validated.items, [{ ...product, availability: "unavailable" }]), RequestError);
  assert.throws(() => quoteItems([{ productId: "missing", quantity: 1 }], [product]), RequestError);
});
test("rejects cross-origin writes and bodies beyond the byte limit", async () => {
  const request = (origin, body = "{}", headers = {}) => new Request("https://store.example/api/inquiries", { method: "POST", headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}), ...headers }, body });
  await assert.rejects(() => readJson(request("https://attacker.example")), error => error.status === 403);
  await assert.rejects(() => readJson(request(null)), error => error.status === 403);
  await assert.rejects(() => readJson(request("https://store.example", JSON.stringify({ message: "x".repeat(500) })), 100), error => error.status === 413);
  await assert.rejects(() => readJson(request("https://store.example", "{bad")), error => error.status === 400);
  assert.deepEqual(await readJson(request("https://store.example", '{"ok":true}')), { ok: true });
});
test("empty wallet settings cannot enable automatic crypto readiness", () => {
  const settings = validateSettings({ email: "", phone: "", country: "United States", currency: "USD", btcEnabled: true, usdtEnabled: true, btcAddress: "", usdtAddress: "", usdtNetwork: "", shippingNote: "Shipping confirmed in quote.", returnsNote: "Returns confirmed in quote." });
  assert.equal(settings.btcConfigured, false);
  assert.equal(settings.usdtConfigured, false);
  assert.equal(settings.email, "");
});
test("admin product validation blocks unsafe URLs and invalid discounts", () => {
  const draft = { ...product, slug: "travel-scooter", brand: "Example", category: "Travel", categories: ["Travel"], referencePrice: 749, description: "A travel mobility scooter.", image: "/images/travel.jpg", images: ["/images/travel.jpg"], rangeMiles: 10, maxSpeedMph: 4, capacityLb: 300, weightLb: null, featured: false, sourceUrl: "https://manufacturer.example/travel", priceCheckedAt: "2026-11-12" };
  const validated = validateProduct(draft);
  assert.equal(validated.price, 649.99);
  assert.equal(validated.category, "travel");
  assert.deepEqual(validated.categories, ["travel"]);
  assert.deepEqual(validateProduct({ ...draft, image: "/images/new.jpg" }).images, ["/images/new.jpg", "/images/travel.jpg"]);
  for (const image of ["javascript:alert(1)", "http://example.com/travel.jpg", "/images/../private.txt", "https://name:password@example.com/photo.jpg"]) assert.throws(() => validateProduct({ ...draft, image }), RequestError);
  assert.throws(() => validateProduct({ ...draft, referencePrice: 100 }), RequestError);
  assert.throws(() => validateProduct({ ...draft, slug: "../admin" }), RequestError);
});
