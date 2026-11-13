import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {createHash} from "node:crypto";
import { stripTypeScriptTypes } from "node:module";

// Compile pure boundary helpers in memory so these checks do not need a Worker,
// network access or a test database and exercise the same authored functions.
const moduleUrl = async (path, replacements = {}) => {
  let source = stripTypeScriptTypes(await fs.readFile(new URL(path, import.meta.url), "utf8"));
  for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(from, to);
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
};
const galleryUrl = await moduleUrl("../lib/gallery-policy.ts");
const { uniqueGallery } = await import(galleryUrl);
const validationUrl = await moduleUrl("../lib/server/validation.ts", { '"../gallery-policy"': JSON.stringify(galleryUrl) });
const { validateInquiry, validateProduct, validateSettings, RequestError } = await import(validationUrl);
const requestUrl = await moduleUrl("../lib/server/request.ts", { '"./validation"': JSON.stringify(validationUrl) });
const { readJson } = await import(requestUrl);
const quoteUrl = await moduleUrl("../lib/server/quote.ts", { '"./validation"': JSON.stringify(validationUrl) });
const { quoteItems } = await import(quoteUrl);
const { adminPolicy } = await import(await moduleUrl("../lib/server/auth-policy.ts"));
const { publicProduct } = await import(await moduleUrl("../lib/public-product.ts"));
const goodInquiry = { name: "Alex Rider", email: "alex@example.com", paymentPreference: "assisted", items: [{ productId: "travel", quantity: 1 }], consent: true };
const product = { id: "travel", name: "Travel scooter", price: 649.99, active: true, availability: "confirm" };

test("customer catalog excludes admin research and preserves the complete gallery", async () => {
  const catalog=JSON.parse(await fs.readFile(new URL("../lib/catalog-data.json",import.meta.url),"utf8"));
  const publicCatalog=JSON.parse(await fs.readFile(new URL("../lib/public-catalog-data.json",import.meta.url),"utf8"));
  const categoryKey=value=>value.toLowerCase().replaceAll(" ","-");
  const normalized=catalog.map(record=>publicProduct({...record,category:categoryKey(record.category),categories:record.categories.map(categoryKey)}));
  assert.deepEqual(publicCatalog,JSON.parse(JSON.stringify(normalized)),"Run npm run catalog:sync after changing seed products");
  for(const record of catalog){
    const safe=publicProduct({...record,futureAdminNote:"Private research"});
    for(const field of ["referencePrice","sourceUrl","priceCheckedAt","galleryExceptionNote","futureAdminNote"]){
      assert.equal(Object.hasOwn(safe,field),false,`${record.id}: exposed ${field}`);
    }
    assert.deepEqual(safe.images,record.images);
    assert.deepEqual(safe.imageDetails,record.imageDetails);
    assert.equal(safe.price,record.price);
  }
});

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
  const draft = { ...product, active: false, slug: "travel-scooter", brand: "Example", category: "Travel", categories: ["Travel"], referencePrice: 749, description: "A travel mobility scooter.", image: "/images/travel.jpg", images: ["/images/travel.jpg"], rangeMiles: 10, maxSpeedMph: 4, capacityLb: 300, weightLb: null, featured: false, sourceUrl: "https://manufacturer.example/travel", priceCheckedAt: "2026-11-12" };
  const validated = validateProduct(draft);
  assert.equal(validated.price, 649.99);
  assert.equal(validated.category, "travel");
  assert.deepEqual(validated.categories, ["travel"]);
  assert.deepEqual(validateProduct({ ...draft, image: "/images/new.jpg" }).images, ["/images/new.jpg", "/images/travel.jpg"]);
  for (const image of ["javascript:alert(1)", "http://example.com/travel.jpg", "/images/../private.txt", "https://name:password@example.com/photo.jpg"]) assert.throws(() => validateProduct({ ...draft, image }), RequestError);
  assert.throws(() => validateProduct({ ...draft, referencePrice: 100 }), RequestError);
  assert.throws(() => validateProduct({ ...draft, slug: "../admin" }), RequestError);
});

test("published scooters require eight images or a documented five-image exception", () => {
  const images=Array.from({length:8},(_,i)=>`/images/scooter-${i+1}.jpg`);
  const draft={...product,slug:"travel-scooter",brand:"Example",category:"travel",categories:["travel"],referencePrice:749,description:"A travel mobility scooter.",image:images[0],images,rangeMiles:10,maxSpeedMph:4,capacityLb:300,weightLb:null,featured:false,sourceUrl:"https://manufacturer.example/travel",priceCheckedAt:"2026-11-12"};
  assert.equal(validateProduct(draft).images.length,8);
  assert.equal(validateProduct({...draft,images:[...images,"   ",""]}).images.length,8);
  assert.equal(validateProduct({...draft,images:Array.from({length:16},(_,i)=>`/images/scooter-${i+1}.jpg`).concat("")}).images.length,16);
  assert.throws(()=>validateProduct({...draft,images:images.slice(0,4)}),error=>error.status===400);
  assert.throws(()=>validateProduct({...draft,images:images.slice(0,5)}),/explain why/);
  assert.equal(validateProduct({...draft,images:images.slice(0,5),galleryExceptionNote:"Manufacturer and specialist retailer sources provide only five distinct exact-model images."}).images.length,5);
  assert.equal(validateProduct({...draft,active:false,images:[images[0]]}).images.length,1);
  assert.throws(()=>validateProduct({...draft,images:Array.from({length:17},(_,i)=>`/images/view-${i}.jpg`)}),/up to 16/);
  assert.equal(uniqueGallery("https://cdn.example/scooter.jpg?v=1&width=800",["https://cdn.example/scooter.jpg?width=200&v=2"]).length,1);
  assert.throws(()=>validateProduct({...draft,image:"https://cdn.example/scooter.jpg",images:images.slice(0,3).concat("https://cdn.example/scooter.jpg?width=200")}),/at least 5/);
});

test("every catalog gallery has sourced, distinct, intact local images", async () => {
  const catalog=JSON.parse(await fs.readFile(new URL("../lib/catalog-data.json",import.meta.url),"utf8"));
  const audit=JSON.parse(await fs.readFile(new URL("../docs/catalog-gallery-audit.json",import.meta.url),"utf8"));
  assert.equal(new Set(catalog.map(p=>p.id)).size,catalog.length,"Duplicate product ID");
  assert.equal(new Set(catalog.map(p=>p.slug)).size,catalog.length,"Duplicate product URL");
  for(const product of catalog){
    const normalized={...product,category:product.category.toLowerCase().replaceAll(" ","-"),categories:product.categories.map(c=>c.toLowerCase().replaceAll(" ","-"))};
    const validated=validateProduct(normalized,product.id);
    assert.ok(product.images.length>=8,`${product.slug}: the seeded catalog requires at least eight photos`);
    assert.equal(validated.images.length,product.images.length,`${product.slug}: duplicate image URLs`);
    const record=audit.products.find(p=>p.id===product.id);
    assert.ok(record,`${product.slug}: missing image provenance`);
    assert.equal(record.photos.length,product.images.length);
    const hashes=new Set();
    for(const src of product.images){
      assert.match(src,/^\/images\/products\/[a-zA-Z0-9/_.-]+$/);
      assert.ok(!src.includes(".."));
      const photo=record.photos.find(p=>p.src===src);
      assert.ok(photo,`${product.slug}: missing photo source`);
      assert.match(photo.sourcePage,/^https:\/\//);
      assert.match(photo.sourceUrl,/^https:\/\//);
      const bytes=await fs.readFile(new URL("../public"+src,import.meta.url));
      assert.ok(bytes.length>=1000,`${src}: empty or tiny photo`);
      assert.ok((bytes[0]===255&&bytes[1]===216)||bytes.subarray(1,4).toString()==="PNG"||(bytes.subarray(0,4).toString()==="RIFF"&&bytes.subarray(8,12).toString()==="WEBP"),`${src}: unsupported or corrupt image signature`);
      const hash=createHash("sha256").update(bytes).digest("hex");
      assert.equal(hash,photo.sha256,`${src}: photo bytes changed after validation`);
      assert.ok(!hashes.has(hash),`${product.slug}: duplicate photo file`);
      hashes.add(hash);
      assert.ok(photo.width>=300&&photo.height>=300,`${src}: inadequate source dimensions`);
      assert.ok(product.imageDetails?.some(d=>d.src===src&&d.alt),`${src}: missing accessible photo description`);
    }
  }
});

test("standing wheel categories can be edited without seated-model speed limits", async () => {
  const catalog=JSON.parse(await fs.readFile(new URL("../lib/catalog-data.json",import.meta.url),"utf8"));
  const standing=catalog.find(p=>p.id==="cycleboard-x-quad-3000");
  assert.equal(validateProduct(standing).maxSpeedMph,27);
  assert.equal(validateProduct({...standing,category:"4-wheel"}).maxSpeedMph,27);
  assert.throws(()=>validateProduct({...standing,categories:["4-wheel"],category:"4-wheel"}),/speed/);
});
