import { env } from "cloudflare:workers";
import { adminSessionCookie, createAdminSession, passwordAuthState, validPasswordInput, verifyPassword } from "@/lib/server/admin-auth";
import { failure, json, rateLimit, readJson } from "@/lib/server/http";
import { RequestError } from "@/lib/server/validation";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const data = await readJson(request, 3_000) as { email?: unknown; password?: unknown } | null;
    const state = passwordAuthState(env);
    if (state.mode !== "password" || !state.config) throw new RequestError("Admin sign-in is temporarily unavailable.", 503);
    // Durable limits precede the expensive verifier; the fixed account bucket
    // also bounds guessing spread across several IP addresses.
    await rateLimit(request, "admin-login-ip", 5);
    await rateLimit(request, "admin-login-account", 30, "password-admin");
    if (!data || typeof data.email !== "string" || data.email.length > 254 || !validPasswordInput(data.password)) throw new RequestError("Invalid email or password.", 401);
    const email = data.email.trim().toLowerCase();
    // Derive for every well-formed email so account mismatch is not a shortcut.
    const passwordMatches = await verifyPassword(data.password, state.config.passwordHash);
    if (email !== state.config.email || !passwordMatches) throw new RequestError("Invalid email or password.", 401);
    const token = await createAdminSession(state.config, new URL(request.url).host);
    const response = json({ authorized: true, email: state.config.email, mode: "password" });
    response.headers.set("Set-Cookie", adminSessionCookie(token));
    return response;
  } catch (error) { return failure(error); }
}
