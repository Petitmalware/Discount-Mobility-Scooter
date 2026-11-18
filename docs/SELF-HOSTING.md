# Hosting on the existing server

The production target is the owner's server at 63.141.255.57. Preserve other applications, users, ports and virtual hosts. Inventory the existing web server before installing any template from deploy/; adapt the vhost to the actual server rather than replacing global configuration.

## Build and runtime

Use Node 24 LTS or newer compatible Node, npm 11.19.1 and the locked dependencies. Run `npm run install:ci`, `npm test`, `npm run typecheck`, `npm run audit:security`, then `npm run build:node`. Start with `npm run start:node`. The Node build deliberately omits the Cloudflare runtime plugin and aliases server bindings to Node's protected environment and SQLite adapter.

Vinext's CLI writes to `dist`. Build each target in its own release checkout; do not run the Sites and Node builds concurrently in the same directory. Keep historical releases and use an atomic `current` symlink to support rollback. Do not serve the checkout directory as a public document root. The Node server serves only the framework's built static assets.

Create a dedicated service account and isolated `/srv/discount-mobility-scooter/releases` and `/var/lib/discount-mobility-scooter` directories. Runtime secrets live in `/etc/discount-mobility-scooter/runtime.env`, readable by the service and root only. The systemd template uses read-only application files, a private temporary directory, no extra capabilities and one explicitly writable database directory. Adjust its Node executable path to the installed version.

`start-node.mjs` requires a complete password-admin configuration, binds only to 127.0.0.1, checks the allowed host and requires a trusted HTTPS proxy indication. The domain's reverse proxy must overwrite Host, X-Forwarded-Host, X-Forwarded-Proto and X-Real-IP. The application removes supplied ChatGPT identity headers and replaces the IP used for rate limiting with the trusted proxy's client address. Never expose its loopback port through another public proxy or tunnel. TLS, firewall rules and account permissions remain server administration responsibilities.

## Database migration

Set `DMS_DATABASE_PATH` to an absolute path outside the release and public assets, then run `npm run db:migrate:node` before starting the service. Migrations run in transactions, record checksums, and refuse edited previously applied migrations. They never run inside an HTTP handler. SQLite uses WAL, foreign keys, a busy timeout and prepared values; transaction batches roll back together.

Before cutting over, export existing D1 product overrides, settings and inquiries to a private JSON file with this shape:

```json
{"format":"dms-d1-export-v1","tables":{"product_records":[],"store_settings":[],"inquiries":[]}}
```

Rows use the exact database columns as string values. Run `npm run db:import:node -- /absolute/private/export.json` against the freshly migrated database. The importer accepts only these named tables/columns, imports transactionally, refuses non-empty destinations, and prints only the imported count. Preserve the original database until record counts and customer data have been verified. Never commit the export. Back up the SQLite database using SQLite's backup API or an equivalent consistent snapshot; copying only its main file while WAL is active is unsafe.

## Email

Set MAIL_FROM, MAIL_REPLY_TO and the SMTP values shown in deploy/runtime.env.example. The supplied Spacemail profile uses mail.spacemail.com:465 with TLS. SMTP passwords are independent from the store-admin password; use the actual mailbox credential. Certificate verification and TLS are required, and SMTP authentication is not attempted in plaintext. Port 587 uses mandatory STARTTLS. File and URL attachment access are disabled, recipient/header fields are bounded, and protocol/debug logging is disabled.

A successful SMTP handoff means the provider accepted the message, not proof that the recipient opened or received it. An ambiguous network failure remains pending for admin review; do not automatically resend it. The communications database owns send reservations and message history. No public mail-relay endpoint is exposed.

## Cutover

Verify the new service through its own vhost, then run the web server's configuration test and reload it. Do not restart unrelated websites or change default routes. Point only discountmobilityscooter.com to 63.141.255.57 once the domain vhost and certificate are ready; preserve Spacemail MX/SPF/DKIM records. The earlier Cloudflare A targets are for the previous hosting service and are not the records for this server. Keep a rollback plan and verify all existing websites still return their expected responses after the reload.

Verify correct/incorrect admin login, logout, anonymous admin denial, CSRF rejection, a quote request using an explicitly owned test mailbox, the acknowledgment, admin draft previews, invoice sending and explicitly recorded-payment receipts. Use no real customer inquiry for delivery tests. Delete private staging exports after the verified migration and keep protected backups according to the business's retention policy.
