# Discount Mobility Scooters

Professional scooter catalog and quote checkout, hosted on the owner's server at https://discountmobilityscooter.com. Source: https://github.com/Petitmalware/Discount-Mobility-Scooter.

The catalog has 25 real models and 200 exact-model images, eight per product. Customer pages exclude research sources and reference prices. Admin can add/edit products and configure business contacts and payment preferences.

Checkout includes product photos, itemized estimates, delivery address, state/region and ZIP/postal code. Requests are stored before an automatic branded acknowledgement is submitted through authenticated SMTP. No payment is taken online. Empty cryptocurrency settings lead to payment assistance.

Admin can prepare itemized quotes and invoices, preview and email documents, record verified received payments, create full or partial receipts, write custom branded customer emails and review submission history. Email recipients are bound to the selected inquiry. Provider acceptance is recorded separately from inbox delivery; SMTP cannot guarantee primary-inbox placement.

Production uses Node 24 LTS, an isolated systemd service behind the existing Nginx reverse proxy, SQLite outside the web root and protected runtime secrets. Admin uses salted password verification, signed four-hour cookies, server authorization, CSRF checks and durable rate limits. HTML email previews escape customer input and run in sandboxed iframes. Daily consistent database backups retain the latest 14 snapshots.

Run `npm run install:ci`, `npm test`, `npm run typecheck`, `npm run audit:security`, and `npm run build:node`. Start with `npm run start:node` behind the documented HTTPS proxy. See docs/DEPLOYMENT.md and docs/SELF-HOSTING.md.

Runtime credentials and customer data never belong in Git. Source examples contain empty secret placeholders. The previous Sites build target remains available for compatibility; production is the owner's server. See docs/DEPLOYMENT.md for the narrowly dated withdrawn-advisory exception; moderate and low npm audit findings remain.
