# Security review — November 12, 2026

## Verified boundaries

The seven automated boundary tests cover exact allowlisted administrator access, missing admin configuration, consent and contact validation, duplicate/fractional/excessive quantities, server-authoritative prices, archived/unavailable products, cross-origin requests, streamed request-size limits, empty cryptocurrency configuration, unsafe image/source URLs, and invalid pricing.

Administrator operations require dispatch-owned authenticated identity plus the server runtime `ADMIN_EMAILS` allowlist. Browser-supplied identity headers must never be trusted when deploying outside the Sites gateway. Store runtime secrets in the hosting service. There is no guest bootstrap, shared password, client-only authorization, or public wallet read API.

The storefront collects quote inquiries, not payments. Inquiries are stored in D1 with parameterized SQL and limited by identity/IP time buckets. Bitcoin/USDT settings only enable requests for a manually verified invoice. There is no blockchain transfer, automatic exchange-rate conversion, card collection, or payment-confirmation claim.

## Dependency review

The updated production dependency audit reports **0 known findings**. The full dependency audit, including the server framework and tooling, reports **0 critical, 0 high, 15 moderate, and 3 low** findings. CI blocks high/critical findings across the full dependency tree.

Patched pins and scoped overrides cover the Next runtime, matching React/React DOM/React Server Components 19.2.9, Vite, Sharp, image-size, Undici, WebSocket support, URI parsing, source maps, browser mapping, YAML, and brace expansion. Recovered package downloads were checked against the lockfile's SHA-512 integrity values.

Remaining lower-severity findings are in the retained framework's unused Open Graph/Satori path, migration tooling/esbuild, ESLint tooling, and development helpers. This application does not expose an Open Graph image generation route or accept user-provided SVG templates. Their presence remains a maintenance item; do not interpret the audit or these mitigations as a guarantee that the system is vulnerability-free. A coordinated framework/tooling upgrade should address them before adding such functionality.

## Deployment and operations

The initial Site is owner-private. Customer launch requires a deliberate audience change and confirmation of business identity, contacts, supplier stock, photo usage rights, actual margins, shipping/tax coverage, returns/warranty terms, and payment operations.

Quote requests appear in admin; no email/SMS notification integration is configured. Review the dashboard regularly. Set a retention/deletion policy for customer contact records and arrange backups and access reviews appropriate to the business.

Headers include a Content Security Policy, MIME sniffing protection, referrer and permissions policies, and HTTPS HSTS. Framework hydration currently requires inline scripts. All public write endpoints verify Origin and validate bounded JSON; admin routes additionally authorize every operation.

The local Windows Workers runtime failed with a native access violation during D1 preview startup. The production build is independent of that local runtime. Hosted deployment and browser verification are recorded separately in the delivery notes.
