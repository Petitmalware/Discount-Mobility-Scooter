import { env } from "cloudflare:workers";
import type { Inquiry, StoreSettings } from "../types";
import type { CommunicationWorkspace, EmailLog, EmailNotification, EmailPreview, OrderDocument } from "../commerce-types";
import { database, readProducts, readSettings } from "./store";
import { buildDocument, buildPayment, buildReceipt, cleanText, recordObject } from "./commerce-documents";
import { emailLog, ensureEmail, readDocument, readDocuments, readEmail, readEmailLogs, readInquiry, readPayments, saveDocument, savePayment, type StoredEmailRow } from "./commerce-store";
import { mailStatus, MailTransportError, sendTransactionalMail } from "./mail-transport";
import { renderAcknowledgement, renderCustomerMessage, renderDocument } from "./mail-templates";
import { RequestError } from "./validation";

function notification(status: EmailLog["status"]): EmailNotification { return status === "accepted" ? "sent" : status === "unavailable" ? "unavailable" : "pending"; }
async function attemptMail(record: StoredEmailRow): Promise<{ email: EmailLog; notification: EmailNotification }> {
  const finish = (row: StoredEmailRow) => ({ email: emailLog(row), notification: notification(row.status) });
  if (["accepted", "sending", "uncertain"].includes(record.status)) return finish(record);
  const db = database();
  const now = new Date().toISOString();
  if (!mailStatus(env).configured) {
    await db.prepare("UPDATE email_messages SET status = 'unavailable', last_error = 'mail_not_configured', updated_at = ? WHERE id = ? AND status IN ('queued', 'failed', 'unavailable')").bind(now, record.id).run();
    return finish(await readEmail(record.id));
  }
  if (record.attempts >= 3) throw new RequestError("This message has reached its retry limit. Check the mail provider before trying a new message.", 429);
  const claim = await db.prepare("UPDATE email_messages SET status = 'sending', attempts = attempts + 1, last_error = NULL, updated_at = ? WHERE id = ? AND status IN ('queued', 'failed', 'unavailable') AND attempts < 3").bind(now, record.id).run();
  if (!claim.meta.changes) return finish(await readEmail(record.id));
  let providerId: string;
  try { providerId = (await sendTransactionalMail(env, record.to, record.preview, `dms/${record.id}`)).id; }
  catch (error) {
    const uncertain = !(error instanceof MailTransportError) || error.uncertain;
    const code = error instanceof MailTransportError ? error.code : "mail_acceptance_unknown";
    await db.prepare("UPDATE email_messages SET status = ?, last_error = ?, updated_at = ? WHERE id = ? AND status = 'sending'").bind(uncertain ? "uncertain" : "failed", code, new Date().toISOString(), record.id).run();
    return finish(await readEmail(record.id));
  }
  // Persist acceptance and the document status together. If the database fails
  // after the provider accepts, the message stays 'sending' and is not resent.
  const statements = [db.prepare("UPDATE email_messages SET status = 'accepted', provider_id = ?, last_error = NULL, updated_at = ? WHERE id = ? AND status = 'sending'").bind(providerId, new Date().toISOString(), record.id)];
  if (record.documentId) statements.push(db.prepare("UPDATE order_documents SET status = 'sent' WHERE id = ?").bind(record.documentId));
  await db.batch(statements);
  return finish(await readEmail(record.id));
}

export async function notifyInquiry(inquiry: Inquiry, settings: StoreSettings): Promise<EmailNotification> {
  try {
    const preview = renderAcknowledgement(inquiry, settings);
    const record = await ensureEmail({ id: `ack:${inquiry.id}`, inquiryId: inquiry.id, documentId: null, kind: "acknowledgement", to: inquiry.email, subject: preview.subject, preview, createdAt: new Date().toISOString() });
    return (await attemptMail(record)).notification;
  } catch { return mailStatus(env).configured ? "pending" : "unavailable"; }
}

export async function communicationWorkspace(inquiryId: string): Promise<CommunicationWorkspace> {
  await readInquiry(inquiryId);
  const [documents, payments, emails] = await Promise.all([readDocuments(inquiryId), readPayments(inquiryId), readEmailLogs(inquiryId)]);
  return { documents, payments, emails, mail: mailStatus(env) };
}
export async function documentPreview(id: string): Promise<{ document: OrderDocument; preview: EmailPreview }> {
  const [document, settings] = await Promise.all([readDocument(id), readSettings()]);
  return { document, preview: renderDocument(document, settings) };
}
export async function createDocument(inquiryId: string, value: unknown) {
  const data = recordObject(value);
  const [inquiry, products, existing] = await Promise.all([readInquiry(inquiryId), readProducts(true), readDocuments(inquiryId)]);
  if (existing.length >= 200) throw new RequestError("This inquiry has reached its document limit.", 409);
  let document: OrderDocument;
  if (data.kind === "receipt") {
    const payments = await readPayments(inquiryId);
    const payment = payments.find(row => row.id === data.paymentId);
    if (!payment) throw new RequestError("Select a payment actually recorded for this inquiry.");
    const previous = existing.find(row => row.kind === "receipt" && row.paymentId === payment.id);
    if (previous) return documentPreview(previous.id);
    const invoice = await readDocument(payment.invoiceId);
    document = buildReceipt(invoice, payment, payments);
  } else document = buildDocument(data, inquiry, products);
  await saveDocument(document);
  return { document, preview: renderDocument(document, await readSettings()) };
}
export async function recordPayment(inquiryId: string, value: unknown) {
  const data = recordObject(value);
  const invoice = await readDocument(cleanText(data.invoiceId, "invoice", 100, 1));
  if (invoice.inquiryId !== inquiryId) throw new RequestError("Invoice not found for this inquiry.", 404);
  return { payment: await savePayment(buildPayment(data, invoice)) };
}
export async function sendDocument(id: string) {
  const { document, preview } = await documentPreview(id);
  const record = await ensureEmail({ id: `document:${document.id}`, inquiryId: document.inquiryId, documentId: document.id, kind: document.kind, to: document.customer.email, subject: preview.subject, preview, createdAt: new Date().toISOString() });
  return attemptMail(record);
}
export async function resendAcknowledgement(inquiryId: string) {
  const [inquiry, settings] = await Promise.all([readInquiry(inquiryId), readSettings()]);
  const preview = renderAcknowledgement(inquiry, settings);
  return attemptMail(await ensureEmail({ id: `ack:${inquiry.id}`, inquiryId, documentId: null, kind: "acknowledgement", to: inquiry.email, subject: preview.subject, preview, createdAt: new Date().toISOString() }));
}
export async function customMessagePreview(inquiryId: string, value: unknown) {
  const data = recordObject(value);
  const subject = cleanText(data.subject, "subject", 180, 2);
  if (/[\r\n]/.test(subject)) throw new RequestError("The subject must be a single line.");
  const body = cleanText(data.body, "message", 8_000, 2);
  const [inquiry, settings] = await Promise.all([readInquiry(inquiryId), readSettings()]);
  return { inquiry, preview: renderCustomerMessage(inquiry, settings, subject, body) };
}
export async function sendCustomMessage(inquiryId: string, value: unknown) {
  const data = recordObject(value);
  if (typeof data.idempotencyKey !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.idempotencyKey)) throw new RequestError("Preview this message and provide a fresh send key.");
  const { inquiry, preview } = await customMessagePreview(inquiryId, data);
  return attemptMail(await ensureEmail({ id: `message:${inquiryId}:${data.idempotencyKey.toLowerCase()}`, inquiryId, documentId: null, kind: "message", to: inquiry.email, subject: preview.subject, preview, createdAt: new Date().toISOString() }, true));
}
