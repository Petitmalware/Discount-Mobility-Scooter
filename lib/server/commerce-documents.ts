import type { Inquiry, Product } from "../types";
import type { DeliveryAddress, DocumentItem, OrderDocument, PaymentRecord } from "../commerce-types";
import { RequestError } from "./validation";

export function recordObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RequestError("Please check the document details.");
  return value as Record<string, unknown>;
}
export function cleanText(value: unknown, label: string, max: number, min = 0): string {
  const clean = value === undefined ? "" : typeof value === "string" ? value.trim() : null;
  if (clean === null || clean.length < min || clean.length > max || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(clean)) throw new RequestError(`Please enter a valid ${label}.`);
  return clean;
}
export function cents(value: unknown, label: string, maximum = 10_000_000): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > maximum || Math.abs(Math.round(value * 100) - value * 100) > 0.000001) throw new RequestError(`${label} must be a non-negative amount with at most two decimal places.`);
  return Math.round(value * 100);
}
export function deliveryAddress(inquiry: Inquiry): DeliveryAddress {
  return { line1: inquiry.addressLine1 ?? "", line2: inquiry.addressLine2 ?? "", city: inquiry.city ?? "", state: inquiry.state ?? "", postalCode: inquiry.postcode, country: inquiry.country ?? "" };
}
function address(value: unknown, fallback: DeliveryAddress, required: boolean): DeliveryAddress {
  const row = value === undefined ? fallback : recordObject(value);
  return { line1: cleanText(row.line1, "address line 1", 200, required ? 2 : 0), line2: cleanText(row.line2, "address line 2", 200), city: cleanText(row.city, "city", 100, required ? 1 : 0), state: cleanText(row.state, "state / region", 100, required ? 1 : 0), postalCode: cleanText(row.postalCode, "postal code", 24, required ? 1 : 0), country: cleanText(row.country, "country", 100, required ? 2 : 0) };
}
function date(value: unknown, label: string): string {
  const clean = cleanText(value, label, 10);
  if (clean && (!/^\d{4}-\d{2}-\d{2}$/.test(clean) || !Number.isFinite(Date.parse(clean)) || new Date(clean).toISOString().slice(0, 10) !== clean)) throw new RequestError(`Use a valid YYYY-MM-DD ${label}.`);
  return clean;
}

export function buildDocument(value: unknown, inquiry: Inquiry, products: Product[], now = new Date().toISOString()): OrderDocument {
  const data = recordObject(value);
  if (data.kind !== "quote" && data.kind !== "invoice") throw new RequestError("Choose quote or invoice; receipts require a recorded payment.");
  if (!Array.isArray(data.items) || !data.items.length || data.items.length > 20) throw new RequestError("Choose between 1 and 20 inquiry items.");
  const seen = new Set<string>();
  const items: DocumentItem[] = data.items.map(value => {
    const row = recordObject(value);
    const id = cleanText(row.productId, "product", 100, 1);
    const original = inquiry.items.find(item => item.productId === id);
    if (!original || seen.has(id)) throw new RequestError("Use each item from this customer’s inquiry once.");
    seen.add(id);
    if (typeof row.quantity !== "number" || !Number.isInteger(row.quantity) || row.quantity < 1 || row.quantity > 5) throw new RequestError("Item quantities must be from 1 to 5.");
    const unitCents = cents(row.unitPrice, "Unit price", 30_000);
    const product = products.find(item => item.id === id);
    return { productId: id, name: original.name, image: original.image || product?.image || "", quantity: row.quantity, unitPrice: unitCents / 100, lineTotal: unitCents * row.quantity / 100 };
  });
  const subtotalCents = items.reduce((sum, item) => sum + Math.round(item.lineTotal * 100), 0);
  const shippingCents = cents(data.shipping ?? 0, "Shipping", 100_000);
  const taxCents = cents(data.tax ?? 0, "Tax", 100_000);
  const discountCents = cents(data.discount ?? 0, "Discount");
  const totalCents = subtotalCents + shippingCents + taxCents - discountCents;
  if (totalCents <= 0) throw new RequestError("The document total must be greater than zero.");
  const id = crypto.randomUUID();
  return {
    id, inquiryId: inquiry.id, inquiryReference: inquiry.reference, number: `DMS-${data.kind === "invoice" ? "INV" : "QT"}-${id.replaceAll("-", "").slice(0, 10).toUpperCase()}`,
    kind: data.kind, createdAt: now, status: "draft", customer: { name: inquiry.name, email: inquiry.email, phone: inquiry.phone },
    deliveryAddress: address(data.deliveryAddress, deliveryAddress(inquiry), data.kind === "invoice"), items, currency: inquiry.currency,
    subtotal: subtotalCents / 100, shipping: shippingCents / 100, tax: taxCents / 100, discount: discountCents / 100, total: totalCents / 100,
    amountPaid: 0, balance: totalCents / 100, notes: cleanText(data.notes, "notes", 4_000), paymentInstructions: cleanText(data.paymentInstructions, "payment instructions", 3_000), dueDate: date(data.dueDate, "due date"),
  };
}

export function buildPayment(value: unknown, invoice: OrderDocument, now = new Date().toISOString()): PaymentRecord {
  const data = recordObject(value);
  if (invoice.kind !== "invoice") throw new RequestError("Record a payment against an invoice.");
  if (data.confirmReceived !== true) throw new RequestError("Explicitly confirm that the payment has actually been received.");
  const amount = cents(data.amount, "Payment amount");
  if (amount === 0) throw new RequestError("Payment amount must be greater than zero.");
  const receivedAt = cleanText(data.receivedAt, "payment date", 40, 10);
  const timestamp = Date.parse(receivedAt);
  if (!Number.isFinite(timestamp) || timestamp > Date.parse(now) + 5 * 60_000) throw new RequestError("Enter a valid payment date that is not in the future.");
  return { id: crypto.randomUUID(), inquiryId: invoice.inquiryId, invoiceId: invoice.id, amount: amount / 100, currency: invoice.currency, method: cleanText(data.method, "payment method", 80, 2), reference: cleanText(data.reference, "payment reference", 120, 2), receivedAt: new Date(timestamp).toISOString(), createdAt: now };
}

export function buildReceipt(invoice: OrderDocument, payment: PaymentRecord, payments: PaymentRecord[], now = new Date().toISOString()): OrderDocument {
  if (invoice.kind !== "invoice" || payment.invoiceId !== invoice.id || payment.inquiryId !== invoice.inquiryId || !payments.some(item => item.id === payment.id)) throw new RequestError("A receipt requires a recorded payment for this invoice.");
  const amountPaidCents = payments.filter(item => item.invoiceId === invoice.id).reduce((sum, item) => sum + Math.round(item.amount * 100), 0);
  const id = crypto.randomUUID();
  return { ...invoice, id, kind: "receipt", status: "draft", number: `DMS-RCT-${id.replaceAll("-", "").slice(0, 10).toUpperCase()}`, createdAt: now, invoiceId: invoice.id, paymentId: payment.id, amountPaid: amountPaidCents / 100, balance: Math.max(0, Math.round(invoice.total * 100) - amountPaidCents) / 100, paymentInstructions: "", notes: `Payment recorded: ${payment.method}. Reference: ${payment.reference}. This receipt records ${payment.amount.toFixed(2)} ${payment.currency} received on ${payment.receivedAt.slice(0, 10)}.\n${invoice.notes}`.trim() };
}
