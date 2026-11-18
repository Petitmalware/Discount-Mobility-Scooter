# Production deployment

Primary domain: https://discountmobilityscooter.com

Hosted origin: https://discount-mobility-scooters.nearbykidd.chatgpt.site

Admin path: `/admin`. Runtime credentials are held in the hosting service, never in Git. Configuration and credential rotation are documented in ADMIN.md.

## Spaceship DNS

Add these records using the default TTL. Replace conflicting apex A/AAAA records or parking redirects. Preserve the domain's Spacemail MX and email TXT records.

| Type | Host | Value |
| --- | --- | --- |
| A | @ | 162.159.143.30 |
| A | @ | 172.66.3.26 |
| TXT | _openai-site-verification | openai-site-verification=SPa6XP2-BeUfFrV3LRU_J8kPRSMDw4kBD4qwtdWyfyk |
| TXT | _cf-custom-hostname | 4742b5bc-5ed8-4fc6-9173-7f479ec461ae |

The apex hostname has been registered with the hosting provider. After DNS propagates, refresh its validation status and wait for both hostname and TLS certificate to become active. Adding records alone does not prove activation. The `www` hostname is not configured by these apex records.

## Runtime and data

The Worker requires the D1 `DB` binding and the existing schema in `drizzle/`. Existing data must be preserved. Product images are bundled static assets; no external image service is needed.

Before opening public access, deploy the code with all four password-authentication secrets, verify protected admin APIs reject anonymous requests, and verify login/logout. The public storefront is a quote workflow: it records requests in admin and reprices cart lines on the server. It does not take payment or send email notifications. Customers can contact the configured business mailbox directly.

New business contact defaults apply when no saved settings exist. Existing admin settings take precedence. Empty phone and unconfigured wallet fields remain hidden; customers can request payment assistance.

## Release checks

Run `npm test`, `npm run typecheck`, `npm run audit:security`, and `npm run build`. Publish the matching pushed commit and archive. Check a fresh product detail URL, all eight gallery thumbnails, cart and quote form, admin login/logout, robots.txt and sitemap.xml. Recheck the custom domain only after validation succeeds.

On November 18, 2026, raw `npm audit` reports 30 affected packages: 14 high, 13 moderate, 3 low and no critical. All high results propagate from [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf), which GitHub withdrew that day; no patched Picomatch release exists. `audit:security` excludes only that exact advisory and its dependency propagation, with mandatory review by December 18, 2026. It still reports the raw counts, blocks every other high/critical advisory and fails closed on incomplete reports or network errors. Moderate/low findings remain; this is not a claim of zero audit findings. The policy and focused tests are in `scripts/audit-policy.mjs` and `tests/audit-policy.test.mjs`.
