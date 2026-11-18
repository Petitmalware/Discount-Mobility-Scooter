declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    ADMIN_EMAILS?: string;
    ADMIN_AUTH_MODE?: string;
    ADMIN_LOGIN_EMAIL?: string;
    ADMIN_PASSWORD_HASH?: string;
    ADMIN_SESSION_SECRET?: string;
    MAIL_FROM?: string;
    MAIL_REPLY_TO?: string;
    MAIL_TRANSPORT?: string;
    RESEND_API_KEY?: string;
    DMS_MAILER?: {
      configured: boolean;
      send(message: { idempotencyKey: string; from: string; to: string; replyTo?: string; subject: string; html: string; text: string }): Promise<{ id: string }>;
    };
  }
}
