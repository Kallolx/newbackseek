#!/bin/bash
# Connect the admin panel to Cloudflare so country blocking also runs at the
# Cloudflare edge (and covers cached pages).
#
#   cd /srv/backpagenew/app && git pull --ff-only && sudo bash ops/security/set-cloudflare.sh
#
# Asks for the API token (hidden) and the Zone ID, checks both with Cloudflare
# before saving, stores them in backend/.env, restarts the API and shows the result.
set -euo pipefail
APP=/srv/backpagenew/app
ENV_FILE="$APP/backend/.env"
DOMAIN=backpagenew.com
CF=https://api.cloudflare.com/client/v4

read -r -s -p "Cloudflare API token (hidden): " TOKEN; echo
read -r -p "Zone ID (Cloudflare → $DOMAIN → Overview, right side): " ZONE
TOKEN="$(printf '%s' "$TOKEN" | tr -d '[:space:]')"; ZONE="$(printf '%s' "$ZONE" | tr -d '[:space:]' | tr 'A-F' 'a-f')"
[[ "$TOKEN" =~ ^[A-Za-z0-9_-]{30,}$ ]] || { echo "That does not look like an API token. Nothing was changed."; exit 1; }
[[ "$ZONE" =~ ^[a-f0-9]{32}$ ]] || { echo "The Zone ID must be 32 letters/numbers (use 'Copy zone ID', not the Account ID). Nothing was changed."; exit 1; }

call() { curl -sS -o /tmp/bpn-cf.json -w '%{http_code}' -H "Authorization: Bearer $TOKEN" "$CF$1"; }
echo "Checking with Cloudflare…"
# Works for both user tokens and account tokens (cfat_…): reading the zone proves the token is valid.
[ "$(call /zones/$ZONE)" = 200 ] || { echo "✗ Cloudflare would not let this token read the zone. Check the token (wrong, expired or revoked), the Zone ID, and that the token has Zone → Read for $DOMAIN."; rm -f /tmp/bpn-cf.json; exit 1; }
echo "✓ Token is valid and can read the zone"
grep -q "\"name\":\"$DOMAIN\"" /tmp/bpn-cf.json || { echo "✗ That Zone ID is not $DOMAIN. Nothing was changed."; rm -f /tmp/bpn-cf.json; exit 1; }
echo "✓ Zone is $DOMAIN"
CODE=$(call /zones/$ZONE/rulesets/phases/http_request_firewall_custom/entrypoint)
rm -f /tmp/bpn-cf.json
[ "$CODE" = 200 ] || [ "$CODE" = 404 ] || { echo "✗ The token cannot manage firewall rules (HTTP $CODE). Add Zone → Zone WAF → Edit to the token."; exit 1; }
echo "✓ Token can manage WAF custom rules"

# Save: replace existing lines or append, keeping the file private.
umask 077
TMP=$(mktemp)
grep -vE '^(CLOUDFLARE_API_TOKEN|CLOUDFLARE_ZONE_ID)=' "$ENV_FILE" > "$TMP" || true
printf 'CLOUDFLARE_API_TOKEN=%s\nCLOUDFLARE_ZONE_ID=%s\n' "$TOKEN" "$ZONE" >> "$TMP"
chown --reference="$ENV_FILE" "$TMP"; chmod --reference="$ENV_FILE" "$TMP"
mv "$TMP" "$ENV_FILE"
unset TOKEN
echo "✓ Saved to backend/.env"

cd "$APP"
docker exec app-db-1 psql -U backpagenew -d backpagenew -qc "update security_settings set edge_status='pending' where id=1" >/dev/null
docker compose -p app -f docker-compose.production.yml --env-file backend/.env --profile backend --profile admin up -d --no-deps --force-recreate api >/dev/null 2>&1
echo "Restarting the API and syncing the edge rule…"
for _ in $(seq 1 20); do
  sleep 2
  STATUS=$(docker exec app-db-1 psql -U backpagenew -d backpagenew -Atc "select edge_status || '|' || edge_message from security_settings where id=1" 2>/dev/null || true)
  case "$STATUS" in active*|off*|error*) break;; esac
done
case "$STATUS" in
  active*) echo "✓ Edge rule ACTIVE: Cloudflare now blocks the selected countries before they reach the server.";;
  off*)    echo "✓ Connected. No edge rule is needed for the current settings (country blocking is off)."; ;;
  error*)  echo "✗ ${STATUS#*|}";;
  *)       echo "Saved. Open Admin → Security and press 'Sync Cloudflare now' to check the edge rule.";;
esac
