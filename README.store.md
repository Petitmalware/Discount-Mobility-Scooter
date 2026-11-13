# Discount Mobility Scooters

A responsive scooter storefront with real model photography, searchable catalog, product detail URLs, saved scooters, comparison, persistent quote requests, and protected administration.

## Shopping and payment

This version uses a personal quote checkout. It saves an inquiry, reprices every line on the server, and gives the customer a reference. No money is collected, inventory reserved, or paid order recorded. Delivery, tax, final stock, and product terms must be confirmed before a sale.

BTC/USDT are optional invoice requests. Admin settings store receiving addresses and the USDT network privately; the public catalog only receives configuration flags. Unconfigured payment options fall back to payment assistance. Do not send an invoice until its amount, network, address, validity, and delivery terms are verified. There is no exchange-rate service, blockchain verification, payment webhook, or automatic fulfillment in this version.

## Admin

Visit `/admin` and sign in with the Site owner's authorized ChatGPT account. `ADMIN_EMAILS` is a server runtime secret containing a comma-separated allowlist. It is configured in Sites for the verified owner. No default password or first-visitor administrator exists. Never expose identity headers directly to an untrusted origin when hosting elsewhere. See `docs/ADMIN.md`.

The admin can add/edit/publish/archive products, update price and specification data, review quote requests and their statuses, and configure contacts, currency, delivery/returns text, and crypto invoice preferences. Empty contact fields are hidden. Currency changes do not convert product prices; reprice the full catalog before changing currency.

Testing contacts: `info@homeretreatdirect.com` and `+1 509-205-9501`. Replace them in Settings before customer use if they are not the store's actual contacts. Requests are stored in the admin dashboard; this version does not send email or SMS notifications.

## Starter catalog

Product specifications, manufacturer image URLs, and source price dates are recorded in `docs/CATALOG-SOURCES.md`. Source pricing is a benchmark, not a claim about the store's previous selling price. Discount prices are proposed launch prices, and availability defaults to confirmation required.

Before accepting paid orders, confirm supplier stock and margins, rights to use manufacturer images, business identity, product-specific returns and warranty eligibility, delivery destinations/taxes, and appropriate customer terms. This version makes no authorized-dealer, verified-review, free-delivery, or warranty promises.

## Development

Requires Node 22.13+ and npm. `npm run install:ci` installs the locked dependencies. `npm run dev` starts the portable preview. `npm run build` emits the Cloudflare Worker and static assets. `node --test tests/backend.test.mjs` checks critical validation boundaries. `node node_modules/typescript/bin/tsc --noEmit` checks application types.

The application uses Vinext/React, Cloudflare D1, and dispatch-owned ChatGPT authentication. `.openai/hosting.json` contains Site identity and the D1 binding. Runtime secrets stay in the hosting service. Generated output, local credentials, and local database state are ignored.

## Security boundaries

- Server authorization on every admin operation; explicit email allowlist.
- Same-origin JSON writes, bounded bodies, input validation, parameterized SQL, rate limits, and authoritative cart prices.
- No customer financial data is collected; wallets are withheld from public API responses.
- Security response headers and a Content Security Policy; inline scripts are allowed for framework hydration.
- Persistent customer inquiry data is available only to authorized admins. Database hosting/access, backups, retention, and incident procedures remain operational responsibilities.

Local preview identity simulation is loopback-only and excluded from production. A public customer launch needs an explicit Site audience change; the initial deployed Site is private to its owner.
