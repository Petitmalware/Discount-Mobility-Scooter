import { isIP } from "node:net";

export function allowedHosts(value = "discountmobilityscooter.com") {
  const hosts = value.split(",").map(host => host.trim().toLowerCase());
  if (!hosts.length || hosts.some(host => !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::[0-9]{1,5})?$/.test(host))) throw new Error("Invalid DMS_ALLOWED_HOSTS.");
  return new Set(hosts);
}

export function guardRequest(request, hosts) {
  const rawHost = request.headers.host;
  const host = typeof rawHost === "string" ? rawHost.toLowerCase() : "";
  if (!hosts.has(host)) return false;
  const proto = request.headers["x-forwarded-proto"];
  if (proto !== "https") return false;
  for (const name of Object.keys(request.headers)) {
    if (name.startsWith("oai-authenticated-user-") || name === "cf-connecting-ip" || name === "forwarded") delete request.headers[name];
  }
  const ip = request.headers["x-real-ip"];
  request.headers["cf-connecting-ip"] = typeof ip === "string" && isIP(ip) ? ip : request.socket.remoteAddress ?? "unknown";
  request.headers["x-forwarded-host"] = host;
  return true;
}

export function secureHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  response.setHeader("Strict-Transport-Security", "max-age=31536000");
  response.setHeader("X-Frame-Options", "SAMEORIGIN");
  response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'");
}
