import nodemailer from "nodemailer";
import { createHash } from "node:crypto";

export type OutboundMessage = { idempotencyKey: string; from: string; to: string; replyTo?: string; subject: string; html: string; text: string };
type MailEnvironment = Record<string, string | undefined>;
const mailboxPattern = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}$/;

export function mailbox(value: string): string | null {
  if (!value || value.length > 320 || /[\r\n\0]/.test(value)) return null;
  const match = /^(?:[^<>\r\n]*<)?([^<>\s]+@[^<>\s]+)>?$/.exec(value.trim());
  return match && mailboxPattern.test(match[1]) ? match[1].toLowerCase() : null;
}

export function smtpOptions(values: MailEnvironment) {
  const host = values.SMTP_HOST?.trim();
  const port = Number(values.SMTP_PORT ?? "465");
  const secure = values.SMTP_SECURE === undefined ? port === 465 : values.SMTP_SECURE === "true";
  const sender = mailbox(values.MAIL_FROM ?? "");
  if (!host || !/^[A-Za-z0-9.-]+$/.test(host) || !Number.isInteger(port) || port < 1 || port > 65535 ||
      !values.SMTP_USER || !values.SMTP_PASSWORD || !sender ||
      (values.SMTP_SECURE !== undefined && !["true", "false"].includes(values.SMTP_SECURE)) ||
      (port === 465 && !secure) || (port === 587 && secure)) return null;
  return {
    host, port, secure,
    auth: { user: values.SMTP_USER, pass: values.SMTP_PASSWORD },
    requireTLS: !secure, ignoreTLS: false,
    tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" as const, servername: host },
    connectionTimeout: 8_000, greetingTimeout: 5_000, socketTimeout: 10_000,
    pool: false as const, logger: false as const, debug: false,
    disableFileAccess: true, disableUrlAccess: true,
  };
}

export function createSmtpMailer(values: MailEnvironment) {
  const options = smtpOptions(values);
  const sender = mailbox(values.MAIL_FROM ?? "");
  return {
    configured: Boolean(options),
    async send(message: OutboundMessage): Promise<{ id: string }> {
      if (!options || !sender) throw new Error("Email delivery is not configured.");
      if (mailbox(message.from) !== sender || !mailbox(message.to) || message.to.includes("<") ||
          (message.replyTo && !mailbox(message.replyTo)) || !message.subject || /[\r\n\0]/.test(message.subject) || message.subject.length > 240 ||
          !message.idempotencyKey || message.idempotencyKey.length > 240 || typeof message.html !== "string" || message.html.length > 500_000 ||
          typeof message.text !== "string" || message.text.length > 200_000) throw new Error("Invalid email message.");
      const transporter = nodemailer.createTransport(options);
      const messageId = `<dms.${createHash("sha256").update(message.idempotencyKey).digest("hex")}@${sender.split("@")[1]}>`;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([
          transporter.sendMail({ from: values.MAIL_FROM, to: mailbox(message.to)!, replyTo: message.replyTo,
            subject: message.subject, html: message.html, text: message.text, messageId,
            envelope: { from: sender, to: [mailbox(message.to)!] }, disableFileAccess: true, disableUrlAccess: true }),
          new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("Mail acceptance timed out.")), 12_000); }),
        ]);
        if (!result.accepted?.length || result.rejected?.length) throw new Error("Mail provider did not accept the recipient.");
        return { id: result.messageId || messageId };
      } catch (cause) {
        const error = new Error("The email provider did not confirm acceptance.") as Error & { deliveryUncertain: boolean };
        const code = Number((cause as { responseCode?: number })?.responseCode);
        error.deliveryUncertain = !(Number.isInteger(code) && code >= 400 && code <= 599);
        throw error;
      } finally { if (timeout) clearTimeout(timeout); transporter.close(); }
    },
  };
}
