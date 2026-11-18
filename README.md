# Discount Mobility Scooters

A responsive scooter storefront with 25 real models, 200 sourced gallery images, searchable catalog, brand filters, product detail URLs, saved scooters, comparison, persistent quote requests, and protected administration.

## Shopping and payment

This version uses a personal quote checkout. It saves an inquiry, reprices every line on the server, and gives the customer a reference. No money is collected, inventory reserved, or paid order recorded. Delivery, tax, final stock, and product terms must be confirmed before a sale.

BTC/USDT are optional invoice requests. Admin settings store receiving addresses and the USDT network privately; the public catalog only receives configuration flags. Unconfigured payment options fall back to payment assistance. Do not send an invoice until its amount, network, address, validity, and delivery terms are verified. There is no exchange-rate service, blockchain verification, payment webhook, or automatic fulfillment in this version.

## Admin

Visit `/admin` and sign in with the configured business email and password. Password authentication uses hosted secrets; only a salted password hash is stored. Sessions expire after four hours. See `docs/ADMIN.md`.

The admin can add/edit/publish/archive products, update price and specification data, review quote requests and their statuses, and configure contacts, currency, delivery/returns text, and crypto invoice preferences. Empty contact fields are hidden. Currency changes do not convert product prices; reprice the full catalog before changing currency.

The public contact email defaults to `info@discountmobilityscooter.com`. Phone is hidden until configured in Settings. Requests are stored in the admin dashboard; this version does not send email or SMS notifications.

## Starter catalog

The catalog contains 25 real scooter models and 200 sourced images. Every seeded product has eight genuine exact-model photographs. Seated mobility models and two-wheel/four-wheel standing models have clear category labels. Product specifications, source prices and image provenance are retained in admin and the repository audit documents. Offer prices require supplier confirmation; availability defaults to confirmation required.

Before accepting paid orders, confirm supplier stock and margins, rights to use manufacturer images, business identity, product-specific returns and warranty eligibility, delivery destinations/taxes, and appropriate customer terms. This version makes no authorized-dealer, verified-review, free-delivery, or warranty promises.

## Development

Requires Node 22.13+ and npm 11.19.1, the version used to maintain the portable lockfile and run CI. `npm run install:ci` installs the locked dependencies. `npm run dev` starts the portable preview. `npm run build` emits the Cloudflare Worker and static assets. `npm test` checks authentication and critical validation boundaries. `node node_modules/typescript/bin/tsc --noEmit` checks application types. `npm run audit:security` checks current dependency advisories at the high/critical threshold.

The application uses Vinext/React, Cloudflare D1, and password-protected administration. `.openai/hosting.json` contains Site identity and the D1 binding. Runtime secrets stay in the hosting service. Generated output, local credentials, and local database state are ignored.

## Security boundaries

- Server authorization on every admin operation; salted password verification, signed host-bound sessions, and durable login rate limits.
- Same-origin JSON writes, bounded bodies, input validation, parameterized SQL, rate limits, and authoritative cart prices.
- No customer financial data is collected; wallets are withheld from public API responses.
- Security response headers and a Content Security Policy; inline scripts are allowed for framework hydration.
- Persistent customer inquiry data is available only to authorized admins. Database hosting/access, backups, retention, and incident procedures remain operational responsibilities.

Local preview identity simulation is loopback-only and excluded from production. The custom production domain is `https://discountmobilityscooter.com`. DNS and certificate activation must complete before that domain serves the storefront. See `docs/DEPLOYMENT.md`.

The November 18 raw npm audit reports 30 affected packages, including 14 high results propagated from the single [withdrawn Picomatch advisory GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf), 13 moderate and 3 low. The security gate has one exact advisory exception, expiring after December 18, 2026; it blocks other high/critical findings and audit failures. It does not suppress all Picomatch findings or claim the raw audit is clean. See the release checks in `docs/DEPLOYMENT.md`.

## Product gallery publishing rule

Aim for at least 8 distinct images of the exact model. Published products require at least 5; galleries with 5–7 require a written source-availability exception. Drafts can be saved with fewer. Galleries support up to 16 images, descriptive captions, keyboard navigation, a visible thumbnail grid, and full-size viewing. Common CDN size variants do not count as different photos.

Product source URLs, reference prices, research dates and gallery exception notes appear only in admin. Customer pages and `/api/catalog` receive an explicit public product projection; the full seed catalog is never imported into the customer client bundle.

After changing seed products, run `npm run catalog:sync` to refresh the customer-only seed JSON. The build also regenerates it, and the boundary tests require it to match the public projection. Live admin overrides are still loaded from the public catalog API.
