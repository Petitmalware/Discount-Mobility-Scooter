import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { database } from "./store";
import { RequestError } from "./validation";
import { adminPolicy } from "./auth-policy";
export { readJson } from "./request";

export const jsonHeaders = {
  "Cache-Control": "no-store, private",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

export function json(value: unknown, status = 200) { return Response.json(value, { status, headers: jsonHeaders }); }

export function failure(error: unknown): Response {
  if (error instanceof RequestError) return json({ error: error.message }, error.status);
  // Do not leak SQL, stack traces, configuration or customer data.
  return json({ error: "We couldn’t complete that request. Please try again or contact the store." }, 503);
}

export async function adminIdentity() {
  const user = await getChatGPTUser();
  const setting = (env as Cloudflare.Env & { ADMIN_EMAILS?: string }).ADMIN_EMAILS ?? "";
  return { user, ...adminPolicy(user?.email, setting) };
}

export async function requireAdmin() {
  const identity = await adminIdentity();
  if (!identity.user) throw new RequestError("Sign in to access the administration area.", 401);
  if (!identity.authorized) throw new RequestError("This account is not authorized to manage the store.", 403);
  return identity.user;
}

export async function rateLimit(request: Request, scope: string, limit: number, identity?: string) {
  const now = Math.floor(Date.now() / 1000);
  const bucket = Math.floor(now / 900);
  const caller = identity ?? request.headers.get("CF-Connecting-IP") ?? "unknown";
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${scope}:${caller}:${bucket}`));
  const key = [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, "0")).join("");
  const db = database();
  const row = await db.prepare("INSERT INTO rate_limits (key, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count")
    .bind(key, (bucket + 1) * 900).first<{ count: number }>();
  await db.prepare("DELETE FROM rate_limits WHERE key IN (SELECT key FROM rate_limits WHERE expires_at < ? LIMIT 100)").bind(now).run();
  if (!row || row.count > limit) throw new RequestError("Too many requests. Please try again in 15 minutes or contact the store.", 429);
}
