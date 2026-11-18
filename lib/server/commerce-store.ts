import type { Inquiry } from "../types";
import type { EmailLog, EmailPreview, OrderDocument, PaymentRecord } from "../commerce-types";
import { database } from "./store";
import { RequestError } from "./validation";

export async function readInquiry(id: string): Promise<Inquiry> {
  const row = await database().prepare("SELECT data, status FROM inquiries WHERE id = ?").bind(id).first<{ data: string; status: Inquiry["status"] }>();
  if (!row) throw new RequestError("Inquiry not found.", 404);
  return { ...JSON.parse(row.data), status: row.status };
}
export async function saveDocument(document: OrderDocument): Promise<void> {
  const insert = document.kind === "receipt" ? "INSERT OR IGNORE" : "INSERT";
  await database().prepare(`${insert} INTO order_documents (id, inquiry_id, kind, data, total_cents, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(document.id, document.inquiryId, document.kind, JSON.stringify(document), Math.round(document.total * 100), document.status, document.createdAt).run();
}
export async function readPayments(inquiryId: string): Promise<PaymentRecord[]> {
  const result = await database().prepare("SELECT data FROM payment_records WHERE inquiry_id = ? ORDER BY created_at ASC LIMIT 500").bind(inquiryId).all<{ data: string }>();
  return result.results.map(row => JSON.parse(row.data));
}
function invoiceBalance(document: OrderDocument, payments: PaymentRecord[]): OrderDocument {
  if (document.kind !== "invoice") return document;
  const paid = payments.filter(payment => payment.invoiceId === document.id).reduce((sum, payment) => sum + Math.round(payment.amount * 100), 0);
  return { ...document, amountPaid: paid / 100, balance: Math.max(0, Math.round(document.total * 100) - paid) / 100 };
}
export async function readDocuments(inquiryId: string): Promise<OrderDocument[]> {
  const [result, payments] = await Promise.all([
    database().prepare("SELECT data, status FROM order_documents WHERE inquiry_id = ? ORDER BY created_at DESC LIMIT 200").bind(inquiryId).all<{ data: string; status: OrderDocument["status"] }>(), readPayments(inquiryId),
  ]);
  return result.results.map(row => invoiceBalance({ ...JSON.parse(row.data), status: row.status }, payments));
}
export async function readDocument(id: string): Promise<OrderDocument> {
  const row = await database().prepare("SELECT data, status FROM order_documents WHERE id = ?").bind(id).first<{ data: string; status: OrderDocument["status"] }>();
  if (!row) throw new RequestError("Document not found.", 404);
  const document = { ...JSON.parse(row.data), status: row.status } as OrderDocument;
  return invoiceBalance(document, document.kind === "invoice" ? await readPayments(document.inquiryId) : []);
}
export async function savePayment(payment: PaymentRecord): Promise<PaymentRecord> {
  const key = payment.reference.trim().toLowerCase();
  const db = database();
  const previous = await db.prepare("SELECT data FROM payment_records WHERE invoice_id = ? AND reference_key = ?").bind(payment.invoiceId, key).first<{ data: string }>();
  if (previous) {
    const existing = JSON.parse(previous.data) as PaymentRecord;
    if (existing.amount === payment.amount && existing.method === payment.method) return existing;
    throw new RequestError("This payment reference has already been recorded for the invoice.", 409);
  }
  // One atomic statement checks the remaining integer-cent balance and inserts,
  // preventing concurrent confirmations from recording an overpayment.
  const result = await db.prepare("INSERT OR IGNORE INTO payment_records (id, inquiry_id, invoice_id, reference_key, amount_cents, data, created_at) SELECT ?, ?, ?, ?, ?, ?, ? WHERE ? <= (SELECT total_cents FROM order_documents WHERE id = ? AND inquiry_id = ? AND kind = 'invoice') - COALESCE((SELECT SUM(amount_cents) FROM payment_records WHERE invoice_id = ?), 0)")
    .bind(payment.id, payment.inquiryId, payment.invoiceId, key, Math.round(payment.amount * 100), JSON.stringify(payment), payment.createdAt, Math.round(payment.amount * 100), payment.invoiceId, payment.inquiryId, payment.invoiceId).run();
  if (!result.meta.changes) throw new RequestError("The reference was already used or the payment exceeds the invoice’s remaining balance. Refresh the workspace.", 409);
  return payment;
}

export type StoredEmail = { id: string; inquiryId: string; documentId: string | null; kind: EmailLog["kind"]; to: string; subject: string; preview: EmailPreview; createdAt: string };
export type StoredEmailRow = StoredEmail & { status: EmailLog["status"]; attempts: number; providerId: string | null; lastError: string | null; updatedAt: string };
function emailFromRow(row: { data: string; status: EmailLog["status"]; attempts: number; provider_id: string | null; last_error: string | null; updated_at: string }): StoredEmailRow {
  return { ...JSON.parse(row.data), status: row.status, attempts: row.attempts, providerId: row.provider_id, lastError: row.last_error, updatedAt: row.updated_at };
}
export function emailLog(record: StoredEmailRow): EmailLog {
  const { preview: _privateBody, ...log } = record;
  return log;
}
export async function readEmail(id: string): Promise<StoredEmailRow> {
  const row = await database().prepare("SELECT data, status, attempts, provider_id, last_error, updated_at FROM email_messages WHERE id = ?").bind(id).first<{ data: string; status: EmailLog["status"]; attempts: number; provider_id: string | null; last_error: string | null; updated_at: string }>();
  if (!row) throw new RequestError("Email record not found.", 404);
  return emailFromRow(row);
}
export async function ensureEmail(record: StoredEmail, requireSameContent = false): Promise<StoredEmailRow> {
  await database().prepare("INSERT OR IGNORE INTO email_messages (id, inquiry_id, document_id, data, status, attempts, created_at, updated_at) VALUES (?, ?, ?, ?, 'queued', 0, ?, ?)").bind(record.id, record.inquiryId, record.documentId, JSON.stringify(record), record.createdAt, record.createdAt).run();
  const existing = await readEmail(record.id);
  if (existing.inquiryId !== record.inquiryId || existing.to !== record.to || (requireSameContent && (existing.subject !== record.subject || existing.preview.html !== record.preview.html || existing.preview.text !== record.preview.text))) throw new RequestError("That send key was already used for a different message. Preview the revised message and use a new key.", 409);
  return existing;
}
export async function readEmailLogs(inquiryId: string): Promise<EmailLog[]> {
  const rows = await database().prepare("SELECT data, status, attempts, provider_id, last_error, updated_at FROM email_messages WHERE inquiry_id = ? ORDER BY created_at DESC LIMIT 200").bind(inquiryId).all<{ data: string; status: EmailLog["status"]; attempts: number; provider_id: string | null; last_error: string | null; updated_at: string }>();
  return rows.results.map(row => emailLog(emailFromRow(row)));
}
