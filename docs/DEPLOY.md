# ARES VPS deployment (Artix)

Debian with Docker Engine and the Compose plugin installed. Use Artix's authorized
host administrator session for host changes and Docker commands below. Ordinary
accounts must have neither sudo nor docker-group access (Docker grants root powers).
Use individual SSH keys; rotate the password posted in chat and revoke any exposed
private key before deployment. Never copy chat credentials into commands or git.

## 1. Checkout and environment

The deployment branch must first be published by the team owner; this implementation
worktree does not push it. Deploy `fix/cors-deploy` after publication (or the reviewed
backend branch containing this commit). Do not use `main`: it currently contains Next.js.

```sh
install -d -m 755 /opt/ares
git clone --branch fix/cors-deploy https://github.com/misfonareher-web/claudemaxxing-mars-map.git /opt/ares
cd /opt/ares
cp .env.example .env
chmod 600 .env
DB_PASSWORD=$(openssl rand -hex 32)
sed -i "s/^DB_PASSWORD=.*/DB_PASSWORD=$DB_PASSWORD/" .env
unset DB_PASSWORD
# Replace YOUR-VPS-DOMAIN with the actual frontend origin, or remove that entry.
# Keep https://ares-claudemaxxing.netlify.app for the team's browser frontend.
nano .env
docker compose -p ares config --quiet
docker compose -p ares up -d --build
docker compose -p ares ps
curl -fsS http://127.0.0.1:8080/api/health
```

Keep HTTP_PORT=8080 unless changing the proxy target below. Compose rejects an
unset/empty DB_PASSWORD. Compose configuration alone cannot reject example strings:
the PHP startup script refuses the shipped placeholder and old `local-demo-only`
password. PostgreSQL may already initialize before that rejection, so replace the
placeholder **before first startup**. Use a strong password, not another short example.
Changing `.env` does not rotate a role in an existing PostgreSQL volume. For an
existing deployment use `docker compose -p ares exec db psql -U mars -d mars`, then
`\password mars` interactively, update `.env` privately to match, and recreate services.
Do not delete the volume to rotate credentials.

## 2. HTTPS and DNS (recommended: host Caddy)

In Cloudflare DNS create `api.<domain>` A (and AAAA only if IPv6 works) pointing to
the VPS. Use DNS-only initially so Caddy can obtain a public certificate. Allow TCP
80/443 to the VPS. Install Debian's Caddy package and configure its host listener:

```sh
apt-get update
apt-get install -y caddy
# Replace api.example.com with api.<your actual domain> in this file.
cat > /etc/caddy/Caddyfile <<'EOF'
api.example.com {
    reverse_proxy 127.0.0.1:8080
}
EOF
caddy validate --config /etc/caddy/Caddyfile
systemctl enable --now caddy
systemctl reload caddy
```

The Caddy site name is the public API hostname. Container nginx deliberately uses
`server_name _;`: it receives only loopback traffic from Caddy and does not terminate
TLS. No nginx hostname edit is needed with this path. nginx/PHP-FPM/PostgreSQL are
on the Compose network; only nginx's loopback port is published. Never publish 5432
or 9000. After HTTPS works you can enable the Cloudflare proxy with SSL/TLS mode
**Full (strict)**; keep certificate renewal reachable. Avoid Flexible mode.

Alternative: host nginx with `server_name api.<domain>`, listen 443 ssl, a Cloudflare
Origin Certificate/key readable only by the administrator, and proxy_pass to
http://127.0.0.1:8080. Enable the Cloudflare proxy and Full (strict); an Origin CA
certificate is for Cloudflare-to-origin traffic and is not browser-trusted directly.
Restrict origin ingress to Cloudflare IP ranges if choosing this path. Public
certificates via certbot in front of container nginx are also possible; Caddy above
handles issuance/renewal with fewer steps. Do not run competing host listeners.

## 3. Smoke checks and frontend handoff

Replace api.example.com below. Check health JSON has `status: ok`, `db: true` and
`python: true`; HTTP 200 alone does not prove all dependencies are healthy.

```sh
API=https://api.example.com
curl -fsS "$API/api/health"
curl -fsS "$API/api/score?preset=jezero"
curl -fsS "$API/api/score/point?lon=77.4508&lat=18.4447"
curl -fsS "$API/api/score/point?lon=137.4417&lat=-4.5895"
curl -fsS "$API/api/route" -H 'Content-Type: application/json' \
  -d '{"from":[77.4508,18.4447],"to":[77.401,18.498],"profile":"balanced"}'
curl -i -X OPTIONS "$API/api/route" \
  -H 'Origin: https://ares-claudemaxxing.netlify.app' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: Content-Type'
curl -i "$API/api/score/point?lon=0&lat=0" \
  -H 'Origin: https://ares-claudemaxxing.netlify.app'
curl -i "$API/api/presets" -H 'Origin: https://unlisted.example'
```

Preflight: 204, exact Allow-Origin, Allow-Methods GET, POST, OPTIONS, Allow-Headers
Content-Type, Vary Origin, no Allow-Credentials. The outside-region request must be
400 JSON with the same allowed-origin header. Unlisted origins receive no
Allow-Origin header. CORS lives in PHP and cannot decorate a proxy 502 if PHP is down.
Routes may legitimately report reachable=false with null geometry/metrics; the
frontend must display the reason without drawing a substitute route.

Give Arkadii the actual HTTPS origin. For a Next.js server proxy set its server-side
API_BASE_URL to that origin (without /api) and replace the local-engine handlers.
For direct browser access configure its public API base and rebuild. CORS alone
does not wire the Next.js frontend; confirm point/route calls in the deployed UI.
No global scoring is provided outside Jezero/Gale. Preserve methodology 0.2.0 and
the response disclaimers: this demo is not a validated EVA safety model.

## 4. Update, logs and rollback

```sh
cd /opt/ares
git rev-parse HEAD > /opt/ares-previous-sha
git pull --ff-only
docker compose -p ares config --quiet
docker compose -p ares up -d --build
docker compose -p ares logs --tail=100 web api db
journalctl -u caddy -n 100 --no-pager
```

Repeat the smoke checks after every update. To roll back application code:

```sh
cd /opt/ares
git switch --detach "$(cat /opt/ares-previous-sha)"
docker compose -p ares up -d --build
```

Keep `.env` and the `ares_pgdata` volume. Never run `down -v`. These changes do not
migrate DB schema; future schema/data migrations need a separate backup/rollback.
Return to the deployment branch before the next `git pull`.

## Security before handoff

- Confirm `.env`, passwords, SSH keys and certificate private keys are not in git.
- Replace default DB credentials; rotate the password posted in chat and revoke any exposed key.
- Test a second key-only SSH session before disabling password authentication.
  Configure `PasswordAuthentication no` and `KbdInteractiveAuthentication no` in
  sshd, validate with `sshd -t`, then reload `ssh`. Restrict administrator access.
- Firewall inbound traffic to 22 (trusted admin IPs if practical), 80 and 443 only,
  including IPv6; verify using the VPS provider firewall. Preserve SSH access.
- Normal users get no sudo or docker-group membership. Keep Docker ports on loopback;
  Docker publishing can bypass host firewall rules.
- Use Full (strict) if Cloudflare proxy is enabled; protect `.env` with mode 600.
- Back up persistent DB state before future data/schema changes. Review public API
  load before wider release; this demo has no authentication or rate limiting.
