import { fileURLToPath } from "node:url";
import { allowedHosts, guardRequest, secureHeaders } from "./node-security.mjs";
import { passwordAuthState } from "../lib/server/admin-auth.ts";

process.umask(0o077);
if (!process.env.DMS_DATABASE_PATH) throw new Error("DMS_DATABASE_PATH is required.");
process.env.ADMIN_AUTH_MODE = "password";
if (!passwordAuthState(process.env).configured) throw new Error("Complete password-admin secrets are required before starting this store.");
const hosts = allowedHosts(process.env.DMS_ALLOWED_HOSTS);
const port = Number(process.env.PORT ?? "3187");
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid application PORT.");
process.env.VINEXT_TRUSTED_HOSTS = [...hosts].join(",");
process.env.VINEXT_TRUST_PROXY = "1";
const { startProdServer } = await import("vinext/server/prod-server");
const outDir = fileURLToPath(new URL("../dist/", import.meta.url));
const { server } = await startProdServer({ host: "127.0.0.1", port, outDir });
const handlers = server.listeners("request");
server.removeAllListeners("request");
server.on("request", (request, response) => {
  secureHeaders(response);
  if (!guardRequest(request, hosts)) {
    response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    response.end("Invalid store request.");
    return;
  }
  if ((request.url ?? "").startsWith("/admin") || (request.url ?? "").startsWith("/api/admin")) response.setHeader("Cache-Control", "no-store, private");
  for (const handler of handlers) handler.call(server, request, response);
});
server.requestTimeout = 30_000;
server.headersTimeout = 15_000;
server.keepAliveTimeout = 5_000;
let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => {
  if (stopping) return; stopping = true;
  server.close(() => process.exit(0));
  setTimeout(() => { server.closeAllConnections(); process.exit(0); }, 10_000).unref();
});
