# Production server operations

Store: https://discountmobilityscooter.com
Admin: https://discountmobilityscooter.com/admin
Server: administrator@63.141.255.57

## Update from your local terminal

After pushing your reviewed changes to the GitHub main branch, run:

```powershell
ssh administrator@63.141.255.57
```

Then, in the server terminal:

```bash
sudo /usr/local/sbin/update-discount-mobility-scooter
sudo systemctl status discount-mobility-scooter --no-pager
```

The updater fetches the exact main commit, builds as a separate unprivileged build user, runs types/tests/security checks, backs up the existing database, applies additive migrations, switches the release symlink and restarts only this store. A failed application health check restores the previous release when available. It does not replace the server's global Node runtime or other website configurations.

## Paths and useful commands

- Releases and private Node 24 runtime: /srv/discount-mobility-scooter
- Current release: /srv/discount-mobility-scooter/current
- Runtime secrets: /etc/discount-mobility-scooter/runtime.env (root-only)
- Database: /var/lib/discount-mobility-scooter/store.sqlite (service-only)
- Backups: /var/backups/discount-mobility-scooter (root-only)
- Domain proxy: /etc/nginx/sites-available/discount-mobility-scooter
- App listens only on 127.0.0.1:3187.

```bash
sudo systemctl restart discount-mobility-scooter
sudo journalctl -u discount-mobility-scooter -n 60 --no-pager
sudo systemctl start discount-mobility-scooter-backup.service
sudo systemctl list-timers discount-mobility-scooter-backup.timer
sudo nginx -t
```

Change secrets with `sudoedit /etc/discount-mobility-scooter/runtime.env`, then restart this store. Keep the admin password hashed using the format in docs/ADMIN.md; the mailbox password is a separate SMTP credential. Never paste runtime.env into support chats or Git. Do not source this file in Bash: its dollar signs are literal configuration values. Systemd loads it directly.

## Domain and mail DNS

The apex A record for discountmobilityscooter.com must point to 63.141.255.57. The former 162.159.143.30 and 172.66.3.26 targets belong to the temporary hosting provider and should not be used for this server. Keep Spacemail MX/SPF/DKIM records. Only configure www after adding its DNS alias and a covering certificate.

Email uses mail.spacemail.com:465 with verified TLS. SPF and DKIM should match the provider's records; DMARC should be configured and monitored. Correct authentication improves delivery but cannot force Gmail's Primary tab or prevent all spam filtering. Admin status means provider acceptance, not guaranteed delivery or reading.

## Security audit

As of November 18, 2026, raw npm audit reports 30 affected packages: 14 high entries from the single advisory GHSA-fc5q-39xc-vjpf that GitHub withdrew that day, plus 13 moderate and 3 low. `npm run audit:security` narrowly excludes that withdrawn advisory through December 18, 2026, blocks all other high/critical findings and fails on incomplete audit/network results. Source: https://github.com/advisories/GHSA-fc5q-39xc-vjpf. This is not a claim of zero vulnerabilities.
