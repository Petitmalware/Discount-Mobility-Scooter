"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { AdminStoreSettings, Inquiry, InquiryStatus, Product } from "@/lib/types";
import {uniqueGallery, isSafeImageSource, MIN_PRODUCT_IMAGES, TARGET_PRODUCT_IMAGES, MAX_PRODUCT_IMAGES} from "@/lib/gallery-policy";

async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`/api/admin/${path}`, { method, headers: body === undefined ? {} : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store" });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(result.error || "The request could not be completed.");
  return result as T;
}
function money(value: number, currency = "USD") { return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value); }

const freshProduct = (): Product => ({
  id: "", slug: "", name: "", brand: "", category: "travel", categories: ["travel"],
  price: 799, referencePrice: 899, description: "", image: "", images: [], rangeMiles: 10, maxSpeedMph: 4, capacityLb: 300, weightLb: null,
  featured: false, sourceUrl: "", priceCheckedAt: new Date().toISOString().slice(0, 10), availability: "confirm", active: false,
});
const categoryChoices = [{ id: "travel", label: "Travel & portable" }, { id: "folding", label: "Folding" }, { id: "3-wheel", label: "3-wheel" }, { id: "4-wheel", label: "4-wheel" }, { id: "heavy-duty", label: "Heavy-duty" }, { id: "outdoor", label: "Outdoor" }];

export default function AdminPanel({ email, signOutPath }: { email: string; signOutPath: string }) {
  const [tab, setTab] = useState<"products" | "inquiries" | "settings">("products");
  const [products, setProducts] = useState<Product[]>([]);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [settings, setSettings] = useState<AdminStoreSettings | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function reload() {
    setLoading(true); setError("");
    try {
      const [catalog, requests, config] = await Promise.all([api<{ products: Product[] }>("products"), api<{ inquiries: Inquiry[] }>("inquiries"), api<{ settings: AdminStoreSettings }>("settings")]);
      setProducts(catalog.products); setInquiries(requests.inquiries); setSettings(config.settings);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load the store."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void reload(); }, []);

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editing) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await api<{ product: Product }>(editing.id ? `products/${encodeURIComponent(editing.id)}` : "products", editing.id ? "PUT" : "POST", editing);
      setProducts(current => [...current.filter(product => product.id !== result.product.id), result.product]);
      setEditing(null); setNotice("Product saved. Published products are now visible in the store.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save product."); }
    finally { setBusy(false); }
  }
  async function archive(product: Product) {
    setBusy(true); setError(""); setNotice("");
    try { await api(`products/${encodeURIComponent(product.id)}`, "DELETE", {}); setProducts(current => current.map(row => row.id === product.id ? { ...row, active: false } : row)); setNotice("Product archived. Its saved details remain available here."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not archive product."); }
    finally { setBusy(false); }
  }
  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!settings) return;
    setBusy(true); setError(""); setNotice("");
    try { const result = await api<{ settings: AdminStoreSettings }>("settings", "PUT", settings); setSettings(result.settings); setNotice("Store settings saved."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save settings."); }
    finally { setBusy(false); }
  }
  async function changeStatus(inquiry: Inquiry, status: InquiryStatus) {
    setBusy(true); setError("");
    try { await api(`inquiries/${encodeURIComponent(inquiry.id)}`, "PATCH", { status }); setInquiries(current => current.map(row => row.id === inquiry.id ? { ...row, status } : row)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update inquiry."); }
    finally { setBusy(false); }
  }
  function field(key: keyof Product, value: unknown) { setEditing(current => current ? { ...current, [key]: value } : current); }
  function setting(key: keyof AdminStoreSettings, value: unknown) { setSettings(current => current ? { ...current, [key]: value } : current); }
  const editingGallery = editing ? uniqueGallery(editing.image, editing.images) : [];
  const visibleProducts = products.filter(product => `${product.name} ${product.brand} ${product.category}`.toLowerCase().includes(search.toLowerCase()));

  return <>
    <div className="adm-title"><div><span className="adm-eyebrow">YOUR STORE, AT A GLANCE</span><h1>Store dashboard</h1><p>Manage your catalog, follow up on requests and keep your business details current.</p></div><div className="adm-account"><span>{email}</span><a href={signOutPath} target="_top">Sign out</a></div></div>
    <div className="adm-stats"><div><span>Published scooters</span><strong>{products.filter(product => product.active).length}</strong></div><div><span>New inquiries</span><strong>{inquiries.filter(inquiry => inquiry.status === "new").length}</strong></div><div><span>Catalog products</span><strong>{products.length}</strong></div></div>
    <nav className="adm-tabs" aria-label="Store management"><button aria-current={tab === "products" ? "page" : undefined} onClick={() => { setTab("products"); setEditing(null); }}>Products</button><button aria-current={tab === "inquiries" ? "page" : undefined} onClick={() => setTab("inquiries")}>Quote requests</button><button aria-current={tab === "settings" ? "page" : undefined} onClick={() => setTab("settings")}>Business & payment settings</button></nav>
    {error && <div className="adm-alert adm-error" role="alert">{error}</div>}{notice && <div className="adm-alert adm-success" role="status">{notice}</div>}
    {loading ? <p className="adm-loading" role="status">Loading your store…</p> : <>
      {tab === "products" && !editing && <section className="adm-card"><div className="adm-toolbar"><div><h2>Your scooter catalog</h2><p>Keep specifications and current offer prices accurate.</p></div><button className="adm-button" onClick={() => { setEditing(freshProduct()); setError(""); setNotice(""); }}>+ Add a scooter</button></div><label className="adm-search">Search products<input type="search" placeholder="Search by model, brand or type" value={search} onChange={event => setSearch(event.target.value)} /></label><div className="adm-table-wrap"><table className="adm-table"><thead><tr><th>Product</th><th>Offer / reference</th><th>Availability</th><th>Publication</th><th>Manage</th></tr></thead><tbody>{visibleProducts.map(product => <tr key={product.id}><td><div className="adm-product"><img src={product.image} alt="" /><div><strong>{product.name}</strong><span>{product.brand} · {product.category}</span><span>{product.images.length} photos</span></div></div></td><td><strong>{money(product.price, settings?.currency)}</strong><span>{money(product.referencePrice, settings?.currency)} reference</span></td><td>{product.availability === "confirm" ? "Confirm with supplier" : product.availability === "available" ? "Available" : "Unavailable"}</td><td><span className={`adm-badge ${product.active ? "adm-published" : ""}`}>{product.active ? "Published" : "Archived / draft"}</span></td><td><div className="adm-actions"><button onClick={() => { setEditing({ ...product }); setError(""); }}>Edit</button>{product.active && <button disabled={busy} onClick={() => void archive(product)}>Archive</button>}</div></td></tr>)}</tbody></table></div>{!visibleProducts.length && <p>No products match your search.</p>}</section>}
      {tab === "products" && editing && <section className="adm-card"><div className="adm-toolbar"><div><h2>{editing.id ? "Edit scooter" : "Add a scooter"}</h2><p>Only publish products you can supply. Verify pricing, image permissions and specifications.</p></div><button className="adm-secondary" disabled={busy} onClick={() => setEditing(null)}>Cancel</button></div><form className="adm-form" onSubmit={saveProduct}><div className="adm-form-grid">
        <label>Product name<input required maxLength={160} value={editing.name} onChange={event => field("name", event.target.value)} /></label>
        <label>Brand<input required maxLength={80} value={editing.brand} onChange={event => field("brand", event.target.value)} /></label>
        <label>URL slug<input required pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="model-name-4-wheel" value={editing.slug} onChange={event => field("slug", event.target.value)} /></label>
        <label>Main category<select required value={editing.category} onChange={event => { field("category", event.target.value); field("categories", [...new Set([...editing.categories, event.target.value])]); }}>{categoryChoices.map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}</select></label>
        <fieldset className="adm-full adm-category-choices"><legend>Also show in these categories</legend>{categoryChoices.map(choice => <label className="adm-checkbox" key={choice.id}><input type="checkbox" checked={editing.categories.includes(choice.id) || editing.category === choice.id} disabled={editing.category === choice.id} onChange={event => field("categories", event.target.checked ? [...new Set([...editing.categories, choice.id])] : editing.categories.filter(value => value !== choice.id))} />{choice.label}</label>)}</fieldset>
        <label>Offer price ({settings?.currency})<input required type="number" min="50" max="30000" step="0.01" value={editing.price} onChange={event => field("price", Number(event.target.value))} /></label>
        <label>Verified reference price ({settings?.currency})<input required type="number" min={editing.price} max="50000" step="0.01" value={editing.referencePrice} onChange={event => field("referencePrice", Number(event.target.value))} /></label>
        <label className="adm-full">Description<textarea required minLength={10} maxLength={4000} rows={4} value={editing.description} onChange={event => field("description", event.target.value)} /></label>
        <label className="adm-full">Main image URL (HTTPS, or a local /images/ path)<input required value={editing.image} onChange={event => field("image", event.target.value)} /></label>
        <label className="adm-full">Gallery image URLs, one per line<textarea rows={5} value={editing.images.join("\n")} onChange={event => field("images", event.target.value.split("\n"))} /><span className="adm-field-help">Aim for {TARGET_PRODUCT_IMAGES} distinct images of this exact model. Up to {MAX_PRODUCT_IMAGES} are supported; the main image counts once.</span></label>
        <div className="adm-full adm-gallery-status" role="status"><strong>{editingGallery.length} distinct image URLs</strong><span>{editingGallery.length > MAX_PRODUCT_IMAGES ? "Remove extra images; the gallery supports up to 16." : editingGallery.length >= TARGET_PRODUCT_IMAGES ? "Gallery target met." : editingGallery.length >= MIN_PRODUCT_IMAGES ? "Add more photos if possible, or document the exception below." : "Published products need at least 5 exact-model images; drafts can be saved with fewer."}</span></div>
        {editingGallery.length>0&&<div className="adm-full adm-gallery-previews">{editingGallery.filter(isSafeImageSource).map((src,i)=><a href={src} target="_blank" rel="noopener noreferrer" key={src} aria-label={"Preview gallery photo "+(i+1)}><img src={src} alt={"Gallery photo "+(i+1)} loading="lazy"/><span>{i+1}</span></a>)}</div>}
        {editingGallery.length >= MIN_PRODUCT_IMAGES && editingGallery.length < TARGET_PRODUCT_IMAGES && <label className="adm-full">Why fewer than 8 exact-model images are available<textarea rows={2} required={editing.active} minLength={20} maxLength={600} value={editing.galleryExceptionNote||""} onChange={event=>field("galleryExceptionNote",event.target.value)} placeholder="Record the sources checked and why only 5–7 distinct images are available."/></label>}
        <label>Maximum range (miles)<input required type="number" min="0.1" max="100" step="0.1" value={editing.rangeMiles} onChange={event => field("rangeMiles", Number(event.target.value))} /></label>
        <label>Maximum speed (mph)<input required type="number" min="0.1" max="25" step="0.1" value={editing.maxSpeedMph} onChange={event => field("maxSpeedMph", Number(event.target.value))} /></label>
        <label>Weight capacity (lb)<input required type="number" min="50" max="1000" value={editing.capacityLb} onChange={event => field("capacityLb", Number(event.target.value))} /></label>
        <label>Product weight (lb, optional)<input type="number" min="1" max="500" step="0.1" value={editing.weightLb ?? ""} onChange={event => field("weightLb", event.target.value ? Number(event.target.value) : null)} /></label>
        <label className="adm-full">Specification / reference price source<input required type="url" placeholder="https://manufacturer.com/product" value={editing.sourceUrl} onChange={event => field("sourceUrl", event.target.value)} /></label>
        <label>Price last checked<input required type="date" value={editing.priceCheckedAt} onChange={event => field("priceCheckedAt", event.target.value)} /></label>
        <label>Stock status<select value={editing.availability} onChange={event => field("availability", event.target.value)}><option value="confirm">Confirm availability</option><option value="available">Available — verified by admin</option><option value="unavailable">Unavailable</option></select></label>
        <label className="adm-checkbox"><input type="checkbox" checked={editing.featured} onChange={event => field("featured", event.target.checked)} />Feature this scooter</label>
        <label className="adm-checkbox"><input type="checkbox" checked={editing.active} disabled={!editing.active && editingGallery.length < MIN_PRODUCT_IMAGES} onChange={event => field("active", event.target.checked)} />Publish in the storefront</label>
      </div><div className="adm-form-footer"><button className="adm-button" disabled={busy} type="submit">{busy ? "Saving…" : "Save scooter"}</button><button type="button" className="adm-secondary" disabled={busy} onClick={() => setEditing(null)}>Cancel</button></div></form></section>}
      {tab === "inquiries" && <section className="adm-card"><div className="adm-toolbar"><div><h2>Customer quote requests</h2><p>The most recent 200 requests. Confirm stock, delivery, tax and terms before issuing any invoice.</p></div><button className="adm-secondary" onClick={() => void reload()}>Refresh</button></div>{!inquiries.length ? <div className="adm-empty"><h3>Your first request starts here.</h3><p>Customers’ submitted carts and contact preferences will appear here.</p></div> : <div className="adm-inquiries">{inquiries.map(inquiry => <article className="adm-inquiry" key={inquiry.id}><div className="adm-toolbar"><div><strong>{inquiry.reference}</strong><p>{new Date(inquiry.createdAt).toLocaleString()} · {inquiry.name}</p></div><label>Status<select aria-label={`Status for ${inquiry.reference}`} disabled={busy} value={inquiry.status} onChange={event => void changeStatus(inquiry, event.target.value as InquiryStatus)}><option value="new">New</option><option value="contacted">Contacted</option><option value="quoted">Quoted</option><option value="closed">Closed</option></select></label></div><div className="adm-contact"><a href={`mailto:${inquiry.email}?subject=${encodeURIComponent(`Your Discount Mobility Scooters request ${inquiry.reference}`)}`}>{inquiry.email}</a>{inquiry.phone && <a href={`tel:${inquiry.phone.replace(/[^+0-9]/g, "")}`}>{inquiry.phone}</a>}{inquiry.postcode && <span>Postal code: {inquiry.postcode}</span>}</div><ul>{inquiry.items.map(item => <li key={item.productId}>{item.quantity} × {item.name} <strong>{money(item.quantity * item.unitPrice, inquiry.currency)}</strong></li>)}</ul><p className="adm-inquiry-total">Product estimate <strong>{money(inquiry.subtotal, inquiry.currency)}</strong></p><p>Payment preference: <strong>{inquiry.paymentPreference === "assisted" ? "Payment assistance" : inquiry.paymentPreference.toUpperCase()}</strong></p>{inquiry.message && <p className="adm-message">{inquiry.message}</p>}</article>)}</div>}</section>}
      {tab === "settings" && settings && <section className="adm-card"><h2>Business & payment settings</h2><p>Empty contact fields are hidden from the storefront. Wallet details stay private and are used to prepare a verified invoice.</p><form className="adm-form" onSubmit={saveSettings}><div className="adm-form-grid"><label>Customer contact email<input type="email" value={settings.email} onChange={event => setting("email", event.target.value)} /></label><label>Customer contact phone<input type="tel" value={settings.phone} onChange={event => setting("phone", event.target.value)} /></label><label>Country / sales market<input required value={settings.country} onChange={event => setting("country", event.target.value)} /></label><label>Catalog currency<select value={settings.currency} onChange={event => setting("currency", event.target.value)}>{["USD", "CAD", "GBP", "EUR", "AUD"].map(value => <option key={value}>{value}</option>)}</select></label><p className="adm-full adm-note">Changing currency does not convert product prices. Reprice and verify the entire catalog before changing currency for customers.</p><label className="adm-full">Shipping information<textarea required rows={3} maxLength={1200} value={settings.shippingNote} onChange={event => setting("shippingNote", event.target.value)} /></label><label className="adm-full">Returns & warranty information<textarea required rows={3} maxLength={1200} value={settings.returnsNote} onChange={event => setting("returnsNote", event.target.value)} /></label><h3 className="adm-full">Crypto invoice requests</h3><p className="adm-full">Customers request a quote first. Verify your receiving address and network independently, then confirm the exact crypto amount, delivery and invoice expiry with the customer. This store does not automatically verify blockchain payments.</p><label className="adm-checkbox"><input type="checkbox" checked={settings.btcEnabled} onChange={event => setting("btcEnabled", event.target.checked)} />Allow Bitcoin quote requests</label><label className="adm-checkbox"><input type="checkbox" checked={settings.usdtEnabled} onChange={event => setting("usdtEnabled", event.target.checked)} />Allow USDT quote requests</label><label className="adm-full">BTC receiving address<input autoComplete="off" value={settings.btcAddress} onChange={event => setting("btcAddress", event.target.value)} /></label><label>USDT receiving address<input autoComplete="off" value={settings.usdtAddress} onChange={event => setting("usdtAddress", event.target.value)} /></label><label>USDT network<input placeholder="e.g. Ethereum ERC-20 or Tron TRC-20" autoComplete="off" value={settings.usdtNetwork} onChange={event => setting("usdtNetwork", event.target.value)} /></label><p className="adm-full adm-note">Without receiving details, crypto selections become payment assistance requests and customers are directed to contact the store.</p></div><button className="adm-button" disabled={busy} type="submit">{busy ? "Saving…" : "Save business settings"}</button></form></section>}
    </>}
  </>;
}
