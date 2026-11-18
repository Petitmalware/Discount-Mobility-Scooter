#!/usr/bin/env bash
set -euo pipefail
test "$(id -u)" = 0 || { echo 'Run this updater with sudo.' >&2; exit 1; }
app=/srv/discount-mobility-scooter
runtime="$app/runtime/node"
repo=https://github.com/Petitmalware/Discount-Mobility-Scooter.git
exec 9>/var/lock/discount-mobility-scooter-deploy.lock
flock -n 9 || { echo 'A deployment is already running.' >&2; exit 1; }
test -x "$runtime/bin/node"
getent passwd dms-build >/dev/null || useradd --system --user-group --create-home --home-dir /var/cache/dms-build --shell /usr/sbin/nologin dms-build
if [ ! -d "$app/source/.git" ]; then git clone --quiet "$repo" "$app/source"; fi
test "$(git -C "$app/source" remote get-url origin)" = "$repo" || { echo 'Unexpected source remote.' >&2; exit 1; }
git -C "$app/source" fetch --quiet origin main
sha=$(git -C "$app/source" rev-parse origin/main)
# Verify the exact Linux CI run, including the security audit, before executing
# any build scripts from the new commit. This verifier is part of the installed,
# root-owned updater; it is not loaded from the fetched source tree.
"$runtime/bin/node" --input-type=module - "$sha" <<'VERIFY'
import {setTimeout as pause} from 'node:timers/promises';
const sha=process.argv[2];
if(!/^[0-9a-f]{40}$/.test(sha))throw new Error('Invalid source commit.');
const endpoint=`https://api.github.com/repos/Petitmalware/Discount-Mobility-Scooter/actions/runs?head_sha=${sha}&event=push&branch=main&per_page=20`;
let verified=false;
for(let attempt=0;attempt<30;attempt++){
  const response=await fetch(endpoint,{headers:{'User-Agent':'Discount-Mobility-Verified-Deploy'},signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error('GitHub release verification is unavailable.');
  const data=await response.json();
  const runs=(data.workflow_runs||[]).filter(run=>run.head_sha===sha&&run.head_branch==='main'&&run.event==='push'&&run.path==='.github/workflows/ci.yml').sort((a,b)=>b.id-a.id);
  const run=runs[0];
  if(run?.status==='completed'){
    if(run.conclusion!=='success')throw new Error('This commit failed its required GitHub checks.');
    console.log(`Verified exact-commit Linux checks: ${run.html_url}`);verified=true;break;
  }
  if(attempt===0)console.log('Waiting for the exact commit to pass GitHub checks.');
  await pause(10000);
}
if(!verified)throw new Error('No successful exact-commit check was confirmed.');
VERIFY
release="$app/releases/$(date -u +%Y%m%dT%H%M%SZ)-${sha:0:12}"
case "$release" in "$app"/releases/*) ;; *) exit 1;; esac
install -d -o dms-build -g dms-build -m 0755 "$release"
git -C "$app/source" archive "$sha" | tar -x -C "$release"
chown -R dms-build:dms-build "$release"
npmrun(){ runuser -u dms-build -- env PATH="$runtime/bin:$PATH" "$runtime/bin/node" "$runtime/lib/node_modules/npm/bin/npm-cli.js" --prefix "$release" run "$1"; }
npmrun install:ci
npmrun typecheck
npmrun test
npmrun build:node
chown -R root:root "$release"
chmod -R go-w "$release"
previous=$(readlink -f "$app/current" || true)
if [ -f /var/lib/discount-mobility-scooter/store.sqlite ]; then
  "$runtime/bin/node" --env-file=/etc/discount-mobility-scooter/runtime.env "$release/scripts/backup-node.mjs"
fi
systemd-run --quiet --wait --pipe --collect --property=User=dms-store --property=Group=dms-store --property=EnvironmentFile=/etc/discount-mobility-scooter/runtime.env --working-directory="$release" "$runtime/bin/node" scripts/migrate-node.mjs
ln -sfn "$release" "$app/current.next"
mv -Tf "$app/current.next" "$app/current"
systemctl restart discount-mobility-scooter.service
healthy=false
for attempt in $(seq 1 20); do
  if curl --silent --fail --max-time 3 -H 'Host: discountmobilityscooter.com' -H 'X-Forwarded-Proto: https' http://127.0.0.1:3187/api/catalog >/dev/null; then healthy=true; break; fi
  sleep 1
done
if [ "$healthy" != true ]; then
  if [ -n "$previous" ] && [ -d "$previous" ]; then ln -sfn "$previous" "$app/current.next"; mv -Tf "$app/current.next" "$app/current"; systemctl restart discount-mobility-scooter.service; fi
  echo 'New release failed its health check; previous release restored when available.' >&2
  exit 1
fi
echo "Discount Mobility Scooters deployed: $sha"
