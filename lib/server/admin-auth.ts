// Uses only the Workers Web Crypto API: no Node crypto or browser-side secrets.
export const PASSWORD_ITERATIONS = 100_000;
export const ADMIN_SESSION_SECONDS = 4 * 60 * 60;
export const ADMIN_COOKIE_NAME = "__Host-dms-admin";
const encoder = new TextEncoder();
const HASH_PATTERN = /^pbkdf2-sha256\$100000\$([a-f0-9]{32})\$([a-f0-9]{64})$/;

export type PasswordAuthConfig = { email: string; passwordHash: string; sessionSecret: string };
export type AdminAuthEnvironment = {
  ADMIN_AUTH_MODE?: string;
  ADMIN_LOGIN_EMAIL?: string;
  ADMIN_PASSWORD_HASH?: string;
  ADMIN_SESSION_SECRET?: string;
};
export type PasswordAuthState = { mode: "password" | "chatgpt"; configured: boolean; config: PasswordAuthConfig | null };

export function passwordAuthState(values: AdminAuthEnvironment): PasswordAuthState {
  // Any password setting opts into the new boundary. A partial or misspelled
  // configuration must never quietly reopen the previous identity allowlist.
  const requested = values.ADMIN_AUTH_MODE === "password" ||
    (values.ADMIN_AUTH_MODE !== undefined && values.ADMIN_AUTH_MODE !== "chatgpt") ||
    values.ADMIN_LOGIN_EMAIL !== undefined || values.ADMIN_PASSWORD_HASH !== undefined || values.ADMIN_SESSION_SECRET !== undefined;
  if (!requested) return { mode: "chatgpt", configured: false, config: null };
  const email = (values.ADMIN_LOGIN_EMAIL ?? "").trim().toLowerCase();
  const passwordHash = values.ADMIN_PASSWORD_HASH ?? "";
  const sessionSecret = values.ADMIN_SESSION_SECRET ?? "";
  const valid = email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    HASH_PATTERN.test(passwordHash) && /^[A-Za-z0-9_-]{43,512}$/.test(sessionSecret);
  return { mode: "password", configured: valid, config: valid ? { email, passwordHash, sessionSecret } : null };
}

function hex(bytes: Uint8Array): string { return [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join(""); }
function unhex(value: string): Uint8Array<ArrayBuffer> { return new Uint8Array(value.match(/../g)!.map(byte => parseInt(byte, 16))); }
function base64url(bytes: Uint8Array): string { return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, ""); }
function decode64(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > 1800) return null;
  try {
    const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/"));
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    return base64url(bytes) === value ? bytes : null;
  } catch { return null; }
}

export function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index++) difference |= left[index] ^ right[index];
  return difference === 0;
}

export function validPasswordInput(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512 && encoder.encode(value).length <= 1024;
}

async function derivePassword(password: string, salt: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  // workerd deliberately caps each native PBKDF2 operation at 100,000 iterations.
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: PASSWORD_ITERATIONS }, key, 256));
}

export async function hashPassword(password: string, salt = crypto.getRandomValues(new Uint8Array(16))): Promise<string> {
  if (!validPasswordInput(password) || salt.length !== 16) throw new Error("Invalid password hashing input.");
  return `pbkdf2-sha256$${PASSWORD_ITERATIONS}$${hex(salt)}$${hex(await derivePassword(password, salt))}`;
}

export async function verifyPassword(password: string, record: string): Promise<boolean> {
  const match = HASH_PATTERN.exec(record);
  if (!match || !validPasswordInput(password)) return false;
  return constantTimeEqual(await derivePassword(password, unhex(match[1])), unhex(match[2]));
}

export function normalizeHost(value: string): string | null {
  if (!value || /[\s/@\\?#]/.test(value)) return null;
  try {
    const parsed = new URL(`https://${value}`);
    return parsed.host && parsed.pathname === "/" ? parsed.host.toLowerCase() : null;
  } catch { return null; }
}

async function signingKey(config: PasswordAuthConfig, host: string): Promise<CryptoKey> {
  const root = await crypto.subtle.importKey("raw", encoder.encode(config.sessionSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const context = encoder.encode(JSON.stringify(["dms-admin-session-v1", config.email, config.passwordHash, host]));
  const derived = await crypto.subtle.sign("HMAC", root, context);
  return crypto.subtle.importKey("raw", derived, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function createAdminSession(config: PasswordAuthConfig, hostValue: string, now = Math.floor(Date.now() / 1000)): Promise<string> {
  const host = normalizeHost(hostValue);
  if (!host || !Number.isSafeInteger(now) || now < 0) throw new Error("Invalid session context.");
  const payload = base64url(encoder.encode(JSON.stringify({ v: 1, sub: config.email, aud: host, iat: now, exp: now + ADMIN_SESSION_SECONDS, nonce: base64url(crypto.getRandomValues(new Uint8Array(16))) })));
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await signingKey(config, host), encoder.encode(payload)));
  return `${payload}.${base64url(signature)}`;
}

export async function verifyAdminSession(token: string, config: PasswordAuthConfig, hostValue: string, now = Math.floor(Date.now() / 1000)): Promise<boolean> {
  const host = normalizeHost(hostValue);
  if (!host || !Number.isSafeInteger(now) || token.length > 1800) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const payloadBytes = decode64(parts[0]);
  const signature = decode64(parts[1]);
  if (!payloadBytes || !signature || signature.length !== 32) return false;
  // Native Web Crypto HMAC verification performs the signature comparison.
  if (!(await crypto.subtle.verify("HMAC", await signingKey(config, host), signature, encoder.encode(parts[0])))) return false;
  try {
    const data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(payloadBytes));
    return data?.v === 1 && data.sub === config.email && data.aud === host &&
      Number.isSafeInteger(data.iat) && Number.isSafeInteger(data.exp) && data.iat >= 0 &&
      data.iat <= now + 30 && data.exp > now && data.exp - data.iat === ADMIN_SESSION_SECONDS &&
      typeof data.nonce === "string" && /^[A-Za-z0-9_-]{22}$/.test(data.nonce);
  } catch { return false; }
}

export function adminSessionToken(cookieHeader: string | null): string | null {
  if (!cookieHeader || cookieHeader.length > 16_384) return null;
  const matches = cookieHeader.split(";").map(part => part.trim()).filter(part => part.startsWith(`${ADMIN_COOKIE_NAME}=`));
  return matches.length === 1 ? matches[0].slice(ADMIN_COOKIE_NAME.length + 1) : null;
}

export function adminSessionCookie(token: string): string {
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw new Error("Invalid session token.");
  return `${ADMIN_COOKIE_NAME}=${token}; Path=/; Max-Age=${ADMIN_SESSION_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}

export function clearAdminSessionCookie(): string {
  return `${ADMIN_COOKIE_NAME}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Strict`;
}
