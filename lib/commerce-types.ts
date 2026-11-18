import type { Currency } from "./types";

export type DeliveryAddress = { line1: string; line2: string; city: string; state: string; postalCode: string; country: string };
export type DocumentKind = "quote" | "invoice" | "receipt";
export type DocumentItem = { productId: string; name: string; image: string; quantity: number; unitPrice: number; lineTotal: number };
export type OrderDocument = {
  id: string; inquiryId: string; inquiryReference: string; number: string; kind: DocumentKind;
  createdAt: string; status: "draft" | "sent"; customer: { name: string; email: string; phone: string };
  deliveryAddress: DeliveryAddress; items: DocumentItem[]; currency: Currency;
  subtotal: number; shipping: number; tax: number; discount: number; total: number;
  amountPaid: number; balance: number; notes: string; paymentInstructions: string; dueDate: string;
  invoiceId?: string; paymentId?: string;
};
export type PaymentRecord = {
  id: string; inquiryId: string; invoiceId: string; amount: number; currency: Currency;
  method: string; reference: string; receivedAt: string; createdAt: string;
};
export type EmailStatus = "queued" | "sending" | "accepted" | "failed" | "unavailable" | "uncertain";
export type EmailLog = {
  id: string; inquiryId: string; documentId: string | null; kind: "acknowledgement" | "message" | DocumentKind;
  to: string; subject: string; status: EmailStatus; attempts: number; providerId: string | null;
  lastError: string | null; createdAt: string; updatedAt: string;
};
export type EmailPreview = { subject: string; html: string; text: string };
export type MailStatus = { configured: boolean; transport: "smtp" | "resend" | "disabled"; from: string };
export type CommunicationWorkspace = { documents: OrderDocument[]; payments: PaymentRecord[]; emails: EmailLog[]; mail: MailStatus };
export type EmailNotification = "sent" | "pending" | "unavailable";
export type DocumentDraftInput = {
  kind: "quote" | "invoice"; items: { productId: string; quantity: number; unitPrice: number }[];
  shipping: number; tax: number; discount: number; deliveryAddress: DeliveryAddress;
  notes?: string; paymentInstructions?: string; dueDate?: string;
};
