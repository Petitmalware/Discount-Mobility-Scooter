import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { pbkdf2Sync } from "node:crypto";
import { stripTypeScriptTypes } from "node:module";

const moduleUrl = async (path, replacements = {}) => {
  let source = stripTypeScriptTypes(await fs.readFile(new URL(path, import.meta.url), "utf8"));
  for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(from, to);
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
};
const helperUrl = await moduleUrl("../lib/server/admin-auth.ts");
const { hashPassword, verifyPassword, passwordAuthState, createAdminSession, verifyAdminSession, adminSessionCookie, clearAdminSessionCookie, adminSessionToken, ADMIN_COOKIE_NAME, ADMIN_SESSION_SECONDS } = await import(helperUrl);
// These are isolated fixture credentials, never a real store credential.
const password = "Isolated test password 🔐";
const salt = Uint8Array.from({ length: 16 }, (_, index) => index);
const record = await hashPassword(password, salt);
const config = { email: "admin@example.test", passwordHash: record, sessionSecret: "a1".repeat(32) };
const values = { ADMIN_AUTH_MODE: "password", ADMIN_LOGIN_EMAIL: config.email, ADMIN_PASSWORD_HASH: config.passwordHash, ADMIN_SESSION_SECRET: config.sessionSecret };
const host = "shop.example.test";
const now = 1_800_000_000;

test("password format matches independent PBKDF2 and verifies without trimming", async () => {
  const expected = pbkdf2Sync(password, salt, 100_000, 32, "sha256").toString("hex");
  assert.equal(record, `pbkdf2-sha256$100000$${Buffer.from(salt).toString("hex")}$${expected}`);
  assert.equal(await verifyPassword(password, record), true);
  assert.equal(await verifyPassword(password + " ", record), false);
  assert.equal(await verifyPassword("incorrect", record), false);
  assert.equal(await verifyPassword(password, record.replace("100000", "600000")), false);
  assert.equal(await verifyPassword(password, "malformed"), false);
});

test("password configuration fails closed and never falls back for partial secrets", () => {
  assert.equal(passwordAuthState({}).mode, "chatgpt");
  assert.equal(passwordAuthState(values).configured, true);
  for (const partial of [{ ADMIN_AUTH_MODE: "password" }, { ADMIN_LOGIN_EMAIL: config.email }, { ADMIN_PASSWORD_HASH: "" }, { ADMIN_SESSION_SECRET: "" }, { ADMIN_AUTH_MODE: "typo" }]) {
    const state = passwordAuthState({ ...partial, ADMIN_EMAILS: "forged@example.test" });
    assert.equal(state.mode, "password");
    assert.equal(state.configured, false);
    assert.equal(state.config, null);
  }
});

test("session is valid only for its signed host and bounded lifetime", async () => {
  const token = await createAdminSession(config, host, now);
  assert.equal(await verifyAdminSession(token, config, host, now), true);
  assert.equal(await verifyAdminSession(token, config, host, now + ADMIN_SESSION_SECONDS - 1), true);
  assert.equal(await verifyAdminSession(token, config, host, now + ADMIN_SESSION_SECONDS), false);
  assert.equal(await verifyAdminSession(token, config, "other.example.test", now), false);
  assert.equal(await verifyAdminSession(token, config, host, now - 31), false);
  assert.equal(await verifyAdminSession(token, config, "shop.example.test@attacker.test", now), false);
});

test("session rejects tampering, malformed tokens and credential rotation", async () => {
  const token = await createAdminSession(config, host, now);
  const [payload, signature] = token.split(".");
  const data = JSON.parse(Buffer.from(payload, "base64url").toString());
  data.exp += 1;
  const tampered = Buffer.from(JSON.stringify(data)).toString("base64url") + "." + signature;
  for (const candidate of [tampered, token + ".extra", "", "x.y", payload + "." + signature.slice(1)]) assert.equal(await verifyAdminSession(candidate, config, host, now), false);
  for (const rotated of [{ ...config, email: "new@example.test" }, { ...config, sessionSecret: "b2".repeat(32) }, { ...config, passwordHash: await hashPassword("Another isolated fixture", salt) }]) assert.equal(await verifyAdminSession(token, rotated, host, now), false);
});

test("cookie is host-only, secure, HttpOnly and expires within four hours", async () => {
  const token = await createAdminSession(config, host, now);
  const cookie = adminSessionCookie(token);
  assert.match(cookie, /^__Host-dms-admin=/);
  for (const attribute of ["Path=/", "Max-Age=14400", "HttpOnly", "Secure", "SameSite=Strict"]) assert.ok(cookie.includes(attribute));
  assert.ok(!cookie.toLowerCase().includes("domain="));
  assert.equal(adminSessionToken(`${ADMIN_COOKIE_NAME}=${token}; other=value`), token);
  assert.equal(adminSessionToken(`${ADMIN_COOKIE_NAME}=${token}; ${ADMIN_COOKIE_NAME}=ambiguous`), null);
  assert.equal(adminSessionToken(`other_${ADMIN_COOKIE_NAME}=${token}`), null);
  assert.match(clearAdminSessionCookie(), /Max-Age=0/);
  assert.match(clearAdminSessionCookie(), /HttpOnly; Secure; SameSite=Strict/);
});

// Run the authored HTTP routes with isolated environment and D1-limit adapters.
// Their real body/Origin validator and cryptographic helpers remain in use.
const galleryUrl = await moduleUrl("../lib/gallery-policy.ts");
const validationUrl = await moduleUrl("../lib/server/validation.ts", { '"../gallery-policy"': JSON.stringify(galleryUrl) });
const requestUrl = await moduleUrl("../lib/server/request.ts", { '"./validation"': JSON.stringify(validationUrl) });
globalThis.__dmsAuthTestEnv = { ...values };
globalThis.__dmsAuthTestLimits = [];
globalThis.__dmsAuthTestDenyRate = false;
const inlineModule = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const envUrl = inlineModule("export const env = globalThis.__dmsAuthTestEnv;");
const httpUrl = inlineModule(`
  export {readJson} from ${JSON.stringify(requestUrl)};
  export function json(value,status=200){return Response.json(value,{status,headers:{'Cache-Control':'no-store, private'}});}
  export function failure(error){return json({error:error.status?error.message:'Unavailable'},error.status||503);}
  export async function rateLimit(request,scope){globalThis.__dmsAuthTestLimits.push(scope);if(globalThis.__dmsAuthTestDenyRate)throw Object.assign(new Error('Too many requests.'),{status:429});}
`);
const replacements = { '"cloudflare:workers"': JSON.stringify(envUrl), '"@/lib/server/admin-auth"': JSON.stringify(helperUrl), '"@/lib/server/http"': JSON.stringify(httpUrl), '"@/lib/server/validation"': JSON.stringify(validationUrl) };
const login = await import(await moduleUrl("../app/api/admin/login/route.ts", replacements));
const logout = await import(await moduleUrl("../app/api/admin/logout/route.ts", replacements));
const loginRequest = (body, origin = `https://${host}`) => new Request(`https://${host}/api/admin/login`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("login returns generic credential errors and issues only a signed secure cookie", async () => {
  for (const body of [{ email: config.email, password: "incorrect" }, { email: "another@example.test", password }]) {
    const response = await login.POST(loginRequest(body));
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Invalid email or password." });
    assert.equal(response.headers.get("set-cookie"), null);
  }
  globalThis.__dmsAuthTestLimits.length = 0;
  const response = await login.POST(loginRequest({ email: config.email, password }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { authorized: true, email: config.email, mode: "password" });
  assert.deepEqual(globalThis.__dmsAuthTestLimits, ["admin-login-ip", "admin-login-account"]);
  const token = adminSessionToken(response.headers.get("set-cookie"));
  assert.ok(token);
  assert.equal(await verifyAdminSession(token, config, host), true);
});

test("login rejects cross-origin, oversized and rate-limited requests without a cookie", async () => {
  const crossOrigin = await login.POST(loginRequest({ email: config.email, password }, "https://attacker.test"));
  assert.equal(crossOrigin.status, 403);
  const oversized = await login.POST(loginRequest({ email: config.email, password: "x".repeat(4000) }));
  assert.equal(oversized.status, 413);
  globalThis.__dmsAuthTestDenyRate = true;
  try {
    const limited = await login.POST(loginRequest({ email: config.email, password }));
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("set-cookie"), null);
  } finally { globalThis.__dmsAuthTestDenyRate = false; }
});

test("logout requires same-origin POST JSON and clears the protected cookie", async () => {
  const request = origin => new Request(`https://${host}/api/admin/logout`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: "{}" });
  const rejected = await logout.POST(request("https://attacker.test"));
  assert.equal(rejected.status, 403);
  assert.equal(rejected.headers.get("set-cookie"), null);
  const response = await logout.POST(request(`https://${host}`));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal(logout.GET, undefined);
});
