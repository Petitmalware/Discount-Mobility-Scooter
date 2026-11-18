import type { EmailPreview, MailStatus } from "../commerce-types";

export type MailEnvironment = {
  MAIL_FROM?: string; MAIL_REPLY_TO?: string; MAIL_TRANSPORT?: string; RESEND_API_KEY?: string;
  DMS_MAILER?: { configured: boolean; send(message: { idempotencyKey: string; from: string; to: string; replyTo?: string; subject: string; html: string; text: string }): Promise<{ id: string }> };
};
export class MailTransportError extends Error {
  readonly code: string;
  readonly uncertain: boolean;
  constructor(code: string, uncertain = false) { super(code); this.code = code; this.uncertain = uncertain; }
}
function validMailbox(value: string | undefined): value is string {
  if (!value || value.length > 320 || /[\r\n,;]/.test(value)) return false;
  const plain = value.includes("<") ? /^[^<>]+<([^<>]+)>$/.exec(value.trim())?.[1] : value.trim();
  return Boolean(plain && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(plain));
}
export function mailStatus(values: MailEnvironment): MailStatus {
  const from = validMailbox(values.MAIL_FROM) ? values.MAIL_FROM : "";
  if (values.DMS_MAILER) return { configured: Boolean(values.DMS_MAILER.configured && from), transport: "smtp", from };
  if (values.MAIL_TRANSPORT === "resend") return { configured: Boolean(from && values.RESEND_API_KEY), transport: "resend", from };
  return { configured: false, transport: "disabled", from };
}
async function boundedJson(response: Response): Promise<{ id?: unknown }> {
  const reader = response.body?.getReader();
  if (!reader) throw new MailTransportError("provider_response_unknown", true);
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > 8_192) { await reader.cancel(); throw new MailTransportError("provider_response_unknown", true); }
    chunks.push(value);
  }
  const buffer = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(buffer)); } catch { throw new MailTransportError("provider_response_unknown", true); }
}

export async function sendTransactionalMail(values: MailEnvironment, to: string, preview: EmailPreview, idempotencyKey: string, fetcher: typeof fetch = fetch): Promise<{ id: string }> {
  const status = mailStatus(values);
  if (!status.configured) throw new MailTransportError("mail_not_configured");
  if (!validMailbox(to) || /[\r\n]/.test(preview.subject) || preview.subject.length > 220 || !/^[a-zA-Z0-9:/_.-]{1,200}$/.test(idempotencyKey)) throw new MailTransportError("invalid_message");
  const message = { idempotencyKey, from: status.from, to, ...(validMailbox(values.MAIL_REPLY_TO) ? { replyTo: values.MAIL_REPLY_TO } : {}), ...preview };
  if (values.DMS_MAILER) {
    try {
      const result = await values.DMS_MAILER.send(message);
      if (!result || typeof result.id !== "string" || !result.id || result.id.length > 500) throw new MailTransportError("smtp_response_unknown", true);
      return result;
    } catch (error) {
      if (error instanceof MailTransportError) throw error;
      const definite = Boolean(error && typeof error === "object" && "deliveryUncertain" in error && error.deliveryUncertain === false);
      throw new MailTransportError(definite ? "smtp_rejected" : "smtp_acceptance_unknown", !definite);
    }
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetcher("https://api.resend.com/emails", {
      method: "POST", redirect: "error", signal: controller.signal,
      headers: { Authorization: `Bearer ${values.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ from: message.from, to: [message.to], subject: message.subject, html: message.html, text: message.text, ...(message.replyTo ? { reply_to: message.replyTo } : {}) }),
    });
    if (!response.ok) { await response.body?.cancel(); throw new MailTransportError(`provider_rejected_${response.status}`); }
    const data = await boundedJson(response);
    if (typeof data.id !== "string" || !data.id || data.id.length > 500) throw new MailTransportError("provider_response_unknown", true);
    return { id: data.id };
  } catch (error) {
    if (error instanceof MailTransportError) throw error;
    throw new MailTransportError("provider_acceptance_unknown", true);
  } finally { clearTimeout(timer); }
}
