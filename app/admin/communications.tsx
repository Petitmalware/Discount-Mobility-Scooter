"use client";

import { useRef, useState, type FormEvent } from "react";
import { Check, FileText, Mail, Plus, RefreshCw, Send, ShieldCheck } from "lucide-react";
import type { Inquiry } from "@/lib/types";
import type { CommunicationWorkspace, DeliveryAddress, DocumentDraftInput, EmailLog, EmailNotification, EmailPreview, OrderDocument } from "@/lib/commerce-types";
import "./communications.css";

type Line = { productId: string; name: string; image?: string; quantity: number; unitPrice: string };
type PreviewResult = { document: OrderDocument; preview: EmailPreview };
type SendResult = { email: EmailLog; notification: EmailNotification };
type Tab = "documents" | "payments" | "email" | "activity";

async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`/api/admin/${path}`, { method, cache: "no-store", credentials: "same-origin", headers: body === undefined ? {} : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(result.error || "The request could not be completed.");
  return result;
}
const amount = (value: string | number) => Number(value || 0);
const cents = (value: string | number) => Math.round(amount(value) * 100);
const money = (value: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
const date = (value: string) => new Date(value).toLocaleString();
const localDateTime = () => { const d = new Date(); const pad = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const statusLabel = (status: EmailLog["status"]) => ({ queued: "Queued", sending: "Submitting", accepted: "Provider accepted", failed: "Failed", unavailable: "Mail unavailable", uncertain: "Outcome uncertain" }[status]);
const activeEmail = (email: EmailLog) => ["queued", "sending", "accepted", "uncertain"].includes(email.status);
function sendNotice(result: SendResult) {
  if (result.email.status === "accepted") return "The mail provider accepted this email. Delivery to the customer's inbox has not been confirmed.";
  if (result.email.status === "uncertain") return "The email submission outcome is uncertain. Check the activity record before trying again.";
  if (result.email.status === "failed") return "The email could not be submitted. The saved document and activity record remain available.";
  if (result.notification === "unavailable") return "Email sending is unavailable. Nothing has been marked as delivered.";
  return "The email is pending. Check its status in Activity before trying again.";
}

export default function Communications({ inquiry }: { inquiry: Inquiry }) {
  return <CommunicationWorkbench key={inquiry.id} inquiry={inquiry} />;
}

function CommunicationWorkbench({ inquiry }: { inquiry: Inquiry }) {
  const base = `inquiries/${encodeURIComponent(inquiry.id)}`;
  const [workspace, setWorkspace] = useState<CommunicationWorkspace | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("documents");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [kind, setKind] = useState<DocumentDraftInput["kind"]>("quote");
  const [lines, setLines] = useState<Line[]>(inquiry.items.map(item => ({ ...item, unitPrice: item.unitPrice.toFixed(2) })));
  const [shipping, setShipping] = useState("0.00");
  const [tax, setTax] = useState("0.00");
  const [discount, setDiscount] = useState("0.00");
  const [address, setAddress] = useState<DeliveryAddress>({ line1: inquiry.addressLine1 || "", line2: inquiry.addressLine2 || "", city: inquiry.city || "", state: inquiry.state || "", postalCode: inquiry.postcode || "", country: inquiry.country || "" });
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [instructions, setInstructions] = useState("");
  const [selected, setSelected] = useState<PreviewResult | null>(null);
  const [confirmDocument, setConfirmDocument] = useState(false);
  const [invoiceId, setInvoiceId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [receivedAt, setReceivedAt] = useState(localDateTime);
  const [confirmReceived, setConfirmReceived] = useState(false);
  const [receiptPayment, setReceiptPayment] = useState("");
  const [subject, setSubject] = useState(`Your scooter request ${inquiry.reference}`);
  const [body, setBody] = useState("");
  const [messagePreview, setMessagePreview] = useState<EmailPreview | null>(null);
  const [confirmMessage, setConfirmMessage] = useState(false);
  const [confirmAcknowledgement, setConfirmAcknowledgement] = useState(false);
  const [messageSubmitted, setMessageSubmitted] = useState(false);
  const messageKey = useRef<string | null>(null);
  const subtotalCents = lines.reduce((sum, line) => sum + cents(line.unitPrice) * line.quantity, 0);
  const total = (subtotalCents + cents(shipping) + cents(tax) - cents(discount)) / 100;
  const documents = workspace?.documents || [];
  const payments = workspace?.payments || [];
  const invoices = documents.filter(document => document.kind === "invoice");
  const balance = (document: OrderDocument) => Math.max(0, (cents(document.total) - payments.filter(payment => payment.invoiceId === document.id).reduce((sum, payment) => sum + cents(payment.amount), 0)) / 100);
  const invoice = invoices.find(document => document.id === invoiceId);
  const mailReady = Boolean(workspace?.mail.configured);
  const acknowledgementSubmitted = workspace?.emails.some(email => email.kind === "acknowledgement" && activeEmail(email));
  const documentSubmitted = selected && (selected.document.status === "sent" || workspace?.emails.some(email => email.documentId === selected.document.id && activeEmail(email)));

  async function load() {
    setLoading(true); setError("");
    try { setWorkspace(await request<CommunicationWorkspace>(`${base}/documents`)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load communications."); }
    finally { setLoading(false); }
  }
  async function perform(action: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The action could not be completed."); }
    finally { setBusy(false); }
  }
  function editLine(index: number, key: "quantity" | "unitPrice", value: string) {
    setLines(current => current.map((line, i) => i === index ? { ...line, [key]: key === "quantity" ? Number(value) : value } : line));
  }
  function editAddress(key: keyof DeliveryAddress, value: string) { setAddress(current => ({ ...current, [key]: value })); }
  async function saveDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await perform(async () => {
      const draft: DocumentDraftInput = { kind, items: lines.map(line => ({ productId: line.productId, quantity: line.quantity, unitPrice: amount(line.unitPrice) })), shipping: amount(shipping), tax: amount(tax), discount: amount(discount), deliveryAddress: address, dueDate, notes, paymentInstructions: instructions };
      const result = await request<PreviewResult>(`${base}/documents`, "POST", draft);
      setSelected(result); setConfirmDocument(false); await load();
      setNotice(`${result.document.number} was saved as an immutable draft. Review the preview before sending.`);
    });
  }
  async function openDocument(id: string) { await perform(async () => { setSelected(await request<PreviewResult>(`documents/${encodeURIComponent(id)}`)); setConfirmDocument(false); }); }
  async function sendDocument() {
    if (!selected || !confirmDocument) return;
    await perform(async () => {
      const result = await request<SendResult>(`documents/${encodeURIComponent(selected.document.id)}/send`, "POST", { confirmSend: true });
      setConfirmDocument(false); await load(); setNotice(sendNotice(result));
    });
  }
  async function recordPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!confirmReceived) return;
    await perform(async () => {
      const result = await request<{ payment: { id: string } }>(`${base}/payments`, "POST", { invoiceId, amount: amount(paymentAmount), method: paymentMethod, reference: paymentReference, receivedAt: new Date(receivedAt).toISOString(), confirmReceived: true });
      setConfirmReceived(false); setPaymentAmount(""); setPaymentReference(""); setReceiptPayment(result.payment.id); await load();
      setNotice("Payment recorded from your confirmation. A receipt can now be prepared; no email was sent.");
    });
  }
  async function createReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!receiptPayment) return;
    await perform(async () => { const result = await request<PreviewResult>(`${base}/documents`, "POST", { kind: "receipt", paymentId: receiptPayment }); setSelected(result); setConfirmDocument(false); await load(); setTab("documents"); setNotice(`${result.document.number} is ready to review. Creating the receipt did not send an email.`); });
  }
  function editMessage(key: "subject" | "body", value: string) { if (key === "subject") setSubject(value); else setBody(value); setMessagePreview(null); setConfirmMessage(false); setMessageSubmitted(false); messageKey.current = null; }
  async function previewMessage(event: FormEvent<HTMLFormElement>) { event.preventDefault(); await perform(async () => { const result = await request<{ preview: EmailPreview }>(`${base}/messages/preview`, "POST", { subject, body }); setMessagePreview(result.preview); setConfirmMessage(false); }); }
  async function sendMessage() {
    if (!messagePreview || !confirmMessage) return;
    await perform(async () => { messageKey.current ||= crypto.randomUUID(); const result = await request<SendResult>(`${base}/messages`, "POST", { subject, body, confirmSend: true, idempotencyKey: messageKey.current }); setConfirmMessage(false); setMessageSubmitted(activeEmail(result.email)); await load(); setNotice(sendNotice(result)); });
  }
  async function sendAcknowledgement() {
    if (!confirmAcknowledgement) return;
    await perform(async () => { const result = await request<SendResult>(`${base}/acknowledgement`, "POST", { confirmSend: true }); setConfirmAcknowledgement(false); await load(); setNotice(sendNotice(result)); });
  }

  return <details className="comm-workbench" onToggle={event => { if (event.currentTarget.open && !workspace && !loading) void load(); }}>
    <summary><span><FileText size={18}/> Documents & customer messages</span><span className="comm-summary-hint">Prepare, review and send</span></summary>
    <div className="comm-body">
      <header className="comm-header"><div><span className="comm-eyebrow">CUSTOMER WORKSPACE</span><h3>{inquiry.name}</h3><p>All documents and email are bound to <strong>{inquiry.email}</strong>.</p></div><button type="button" className="comm-secondary" onClick={()=>void load()} disabled={loading || busy}><RefreshCw size={14}/> Refresh</button></header>
      {error && <p className="comm-alert comm-error" role="alert">{error}</p>}{notice && <p className="comm-alert comm-notice" role="status">{notice}</p>}
      {loading && !workspace ? <p className="comm-loading" role="status">Loading this customer’s workspace…</p> : workspace && <>
        <div className={"comm-mail-state "+(mailReady?"is-ready":"")}><Mail size={17}/><span>{mailReady?`Email configured${workspace.mail.from?` · ${workspace.mail.from}`:""}`:"Email sending is not configured. Drafts, previews and payment records remain available."}</span></div>
        <nav className="comm-tabs" aria-label={`Communications for ${inquiry.reference}`}>{([{id:"documents",label:"Quotes & invoices"},{id:"payments",label:"Payments & receipts"},{id:"email",label:"Customer email"},{id:"activity",label:"Email activity"}] as {id:Tab;label:string}[]).map(item=><button key={item.id} type="button" aria-current={tab===item.id?"page":undefined} onClick={()=>setTab(item.id)}>{item.label}</button>)}</nav>
        {tab === "documents" && <div className="comm-document-layout">
          <section className="comm-panel"><div className="comm-section-heading"><h4>Create a document</h4><span>Draft only</span></div><p className="comm-help">Review prices, delivery and terms. Saved documents are snapshots; create a new draft to make changes.</p>
            <form onSubmit={saveDocument} className="comm-form"><fieldset disabled={busy}>
              <div className="comm-fields"><label>Document type<select value={kind} onChange={event=>setKind(event.target.value as DocumentDraftInput["kind"])}><option value="quote">Quote</option><option value="invoice">Invoice</option></select></label><label>{kind==="quote"?"Valid until":"Due date"} <span>(optional)</span><input type="date" value={dueDate} onChange={event=>setDueDate(event.target.value)}/></label></div>
              <div className="comm-lines">{lines.map((line,index)=><div className="comm-line" key={line.productId}><div className="comm-line-product">{line.image&&<img src={line.image} alt=""/>}<strong>{line.name}</strong></div><label>Quantity<input type="number" min={1} max={5} step={1} required value={line.quantity || ""} onChange={event=>editLine(index,"quantity",event.target.value)}/></label><label>Unit price<input type="number" min={0} max={30000} step="0.01" required value={line.unitPrice} onChange={event=>editLine(index,"unitPrice",event.target.value)}/></label><div className="comm-line-total"><span>Line total</span><strong>{money(cents(line.unitPrice)*line.quantity/100,inquiry.currency)}</strong></div></div>)}</div>
              <div className="comm-fields comm-three"><label>Shipping<input type="number" min={0} max={30000} step="0.01" required value={shipping} onChange={event=>setShipping(event.target.value)}/></label><label>Tax<input type="number" min={0} max={30000} step="0.01" required value={tax} onChange={event=>setTax(event.target.value)}/></label><label>Discount<input type="number" min={0} step="0.01" required value={discount} onChange={event=>setDiscount(event.target.value)}/></label></div>
              <div className="comm-draft-total"><span>Draft total · {inquiry.currency}</span><strong>{money(total,inquiry.currency)}</strong></div>
              <h5>Delivery address</h5><div className="comm-fields"><label className="comm-full">Address line 1<input required maxLength={200} value={address.line1} onChange={event=>editAddress("line1",event.target.value)}/></label><label className="comm-full">Address line 2 <span>(optional)</span><input maxLength={200} value={address.line2} onChange={event=>editAddress("line2",event.target.value)}/></label><label>City / town<input required maxLength={100} value={address.city} onChange={event=>editAddress("city",event.target.value)}/></label><label>State / region<input maxLength={100} value={address.state} onChange={event=>editAddress("state",event.target.value)}/></label><label>Postal code<input required maxLength={24} value={address.postalCode} onChange={event=>editAddress("postalCode",event.target.value)}/></label><label>Country<input required maxLength={100} value={address.country} onChange={event=>editAddress("country",event.target.value)}/></label></div>
              <label>Customer notes <span>(optional)</span><textarea rows={3} maxLength={4000} value={notes} onChange={event=>setNotes(event.target.value)} placeholder="Product configuration, delivery and agreed terms"/></label><label>Payment instructions <span>(optional)</span><textarea rows={3} maxLength={3000} value={instructions} onChange={event=>setInstructions(event.target.value)} placeholder="Only enter independently verified receiving details and payment terms."/></label>
              <button type="submit" className="comm-primary" disabled={total<=0 || !Number.isFinite(total)}><Plus size={16}/> Create {kind} draft</button>
            </fieldset></form>
          </section>
          <div className="comm-saved-column"><section className="comm-panel"><h4>Saved documents <span className="comm-count">{documents.length}</span></h4>{documents.length?<div className="comm-document-list">{documents.map(document=><button type="button" className={"comm-document-card "+(selected?.document.id===document.id?"is-selected":"")} key={document.id} disabled={busy} onClick={()=>void openDocument(document.id)}><span><b>{document.number}</b><small>{document.kind} · {date(document.createdAt)}</small></span><span><strong>{money(document.total,document.currency)}</strong><small>{document.status==="sent"?"Submitted by email":"Draft"}{document.kind==="invoice"?` · ${money(balance(document),document.currency)} balance`:""}</small></span></button>)}</div>:<p className="comm-empty">No documents yet. Create a draft to start.</p>}</section>
            {selected && <section className="comm-panel comm-document-preview"><div className="comm-section-heading"><h4>{selected.document.number}</h4><a className="comm-text-link" href={`/api/admin/documents/${encodeURIComponent(selected.document.id)}/print`} target="_blank" rel="noopener noreferrer">Open / print</a></div><p className="comm-help">To {selected.document.customer.name} · {selected.document.customer.email}</p><iframe title={`${selected.document.number} branded document preview`} sandbox="" srcDoc={selected.preview.html} referrerPolicy="no-referrer"/><p className="comm-preview-subject"><b>Email subject:</b> {selected.preview.subject}</p>{documentSubmitted?<p className="comm-help"><Check size={15}/> This document already has an active or accepted email submission. See Email activity for its status.</p>:<><label className="comm-confirm"><input type="checkbox" checked={confirmDocument} disabled={busy || !mailReady} onChange={event=>setConfirmDocument(event.target.checked)}/><span>I reviewed this document and want to email it to <strong>{selected.document.customer.email}</strong>.</span></label><button type="button" className="comm-primary" disabled={busy || !mailReady || !confirmDocument} onClick={()=>void sendDocument()}><Send size={15}/> Send {selected.document.kind}</button></>}</section>}
          </div>
        </div>}
        {tab === "payments" && <div className="comm-two-panels"><section className="comm-panel"><h4>Record a received payment</h4><p className="comm-help">Record funds only after independently verifying receipt. This action does not charge a customer or verify a blockchain transaction.</p>{invoices.length?<form onSubmit={recordPayment} className="comm-form"><fieldset disabled={busy}><label>Invoice<select required value={invoiceId} onChange={event=>{const next=invoices.find(document=>document.id===event.target.value);setInvoiceId(event.target.value);setPaymentAmount(next?balance(next).toFixed(2):"");setConfirmReceived(false);}}><option value="">Select an invoice</option>{invoices.map(document=><option key={document.id} value={document.id} disabled={balance(document)<=0}>{document.number} · {money(balance(document),document.currency)} outstanding</option>)}</select></label><div className="comm-fields"><label>Received amount · {invoice?.currency || inquiry.currency}<input type="number" required min="0.01" max={invoice?balance(invoice):undefined} step="0.01" value={paymentAmount} onChange={event=>{setPaymentAmount(event.target.value);setConfirmReceived(false);}}/></label><label>Payment method<input required maxLength={80} value={paymentMethod} onChange={event=>{setPaymentMethod(event.target.value);setConfirmReceived(false);}} placeholder="Bank transfer, BTC, USDT…"/></label></div><label>Transaction / payment reference<input required minLength={2} maxLength={120} value={paymentReference} onChange={event=>{setPaymentReference(event.target.value);setConfirmReceived(false);}}/></label><label>Received date & time <span>(your local time)</span><input type="datetime-local" required value={receivedAt} onChange={event=>{setReceivedAt(event.target.value);setConfirmReceived(false);}}/></label><label className="comm-confirm comm-payment-confirm"><input type="checkbox" checked={confirmReceived} onChange={event=>setConfirmReceived(event.target.checked)}/><span>I verified that this payment was actually received, and the amount, invoice and reference are correct.</span></label><button type="submit" className="comm-primary" disabled={!confirmReceived || !invoiceId}><ShieldCheck size={16}/> Record verified payment</button></fieldset></form>:<p className="comm-empty">Create an invoice before recording a payment.</p>}</section>
          <section className="comm-panel"><h4>Payments & receipt drafts</h4>{payments.length?<><div className="comm-payment-list">{payments.map(payment=><div key={payment.id}><span><b>{money(payment.amount,payment.currency)}</b><small>{payment.method} · {payment.reference}</small><small>{date(payment.receivedAt)} · {invoices.find(document=>document.id===payment.invoiceId)?.number || "Invoice"}</small></span><span className="comm-recorded">Recorded</span></div>)}</div><form onSubmit={createReceipt} className="comm-form"><fieldset disabled={busy}><label>Payment for this receipt<select required value={receiptPayment} onChange={event=>setReceiptPayment(event.target.value)}><option value="">Select a recorded payment</option>{payments.map(payment=><option value={payment.id} key={payment.id}>{money(payment.amount,payment.currency)} · {payment.reference}</option>)}</select></label><button className="comm-primary" type="submit" disabled={!receiptPayment}><FileText size={16}/> Create receipt draft</button><p className="comm-help">The receipt uses the selected recorded payment. Review it under Quotes & invoices before sending.</p></fieldset></form></>:<p className="comm-empty">No payments have been recorded for this request.</p>}</section>
        </div>}
        {tab === "email" && <div className="comm-two-panels"><section className="comm-panel"><h4>Write a customer email</h4><p className="comm-help">Recipient: <strong>{inquiry.email}</strong>. Preview the branded message before confirming submission.</p><form className="comm-form" onSubmit={previewMessage}><fieldset disabled={busy}><label>Subject<input required maxLength={180} value={subject} onChange={event=>editMessage("subject",event.target.value)}/></label><label>Message<textarea required rows={8} maxLength={8000} value={body} onChange={event=>editMessage("body",event.target.value)} placeholder={`Hello ${inquiry.name},\n\n`}/></label><button className="comm-secondary" type="submit"><Mail size={15}/> Preview branded email</button></fieldset></form>{messagePreview&&<div className="comm-message-preview"><iframe title={`Email preview for ${inquiry.name}`} sandbox="" srcDoc={messagePreview.html} referrerPolicy="no-referrer"/><label className="comm-confirm"><input type="checkbox" checked={confirmMessage} disabled={busy || !mailReady || messageSubmitted} onChange={event=>setConfirmMessage(event.target.checked)}/><span>I reviewed this message and want to email it to <strong>{inquiry.email}</strong>.</span></label><button type="button" className="comm-primary" disabled={busy || !mailReady || !confirmMessage || messageSubmitted} onClick={()=>void sendMessage()}><Send size={15}/>{messageSubmitted?"Message submitted":"Send this email"}</button></div>}</section>
          <section className="comm-panel comm-acknowledgement"><span className="comm-icon"><Mail size={22}/></span><h4>Request acknowledgement</h4><p className="comm-help">Send the saved request summary and reference to {inquiry.email}. This does not confirm inventory, accept an order or record a payment.</p>{acknowledgementSubmitted?<p className="comm-alert comm-notice">An acknowledgement is already queued, uncertain or accepted by the provider. Review Email activity before another attempt.</p>:<><label className="comm-confirm"><input type="checkbox" checked={confirmAcknowledgement} disabled={busy || !mailReady} onChange={event=>setConfirmAcknowledgement(event.target.checked)}/><span>I want to send this request acknowledgement to <strong>{inquiry.email}</strong>.</span></label><button type="button" className="comm-secondary" disabled={busy || !mailReady || !confirmAcknowledgement} onClick={()=>void sendAcknowledgement()}>Send acknowledgement</button></>}<p className="comm-help comm-delivery-note">“Provider accepted” means the mail service accepted a submission. It does not confirm delivery to the customer’s inbox.</p></section>
        </div>}
        {tab === "activity" && <section className="comm-panel"><div className="comm-section-heading"><h4>Email activity</h4><span>{workspace.emails.length} record{workspace.emails.length===1?"":"s"}</span></div><p className="comm-help">Provider acceptance is distinct from inbox delivery. An uncertain result needs review before another send attempt.</p>{workspace.emails.length?<div className="comm-email-list">{workspace.emails.map(email=><article key={email.id}><div><strong>{email.subject}</strong><p>{email.kind} · To {email.to}</p><small>{date(email.createdAt)} · {email.attempts} attempt{email.attempts===1?"":"s"}</small></div><span className={`comm-email-status comm-status-${email.status}`}>{statusLabel(email.status)}</span></article>)}</div>:<p className="comm-empty">No email activity has been recorded.</p>}</section>}
      </>}
    </div>
  </details>;
}
