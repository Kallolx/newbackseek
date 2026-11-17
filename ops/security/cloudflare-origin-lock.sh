#!/bin/sh
# Only Cloudflare may open HTTP/HTTPS connections to this server. Anyone who
# finds the server IP (scanners, DNS history) gets no response at all.
# SSH (port 22) is NOT affected. Docker publishes 80/443 past ufw, so the rule
# lives in Docker's DOCKER-USER chain. Safe to run repeatedly.
#
#   sudo sh cloudflare-origin-lock.sh          apply / refresh
#   sudo sh cloudflare-origin-lock.sh remove   undo (emergency)
set -eu
# Never run two copies at once (boot service and timer can fire together).
exec 9>/run/bpn-origin-lock.lock
flock 9
CHAIN=BPN-CF-ONLY
IFACE="${BPN_PUBLIC_IFACE:-eth0}"
# Published at https://www.cloudflare.com/ips-v4 (used if the download fails).
FALLBACK="173.245.48.0/20 103.21.244.0/22 103.22.200.0/22 103.31.4.0/22 141.101.64.0/18 108.162.192.0/18 190.93.240.0/20 188.114.96.0/20 197.234.240.0/22 198.41.128.0/17 162.158.0.0/15 104.16.0.0/13 104.24.0.0/14 172.64.0.0/13 131.0.72.0/22"

unhook() {
  for port in 80 443; do
    while iptables -C DOCKER-USER -i "$IFACE" -p tcp -m conntrack --ctorigdstport "$port" --ctdir ORIGINAL -j "$CHAIN" 2>/dev/null; do
      iptables -D DOCKER-USER -i "$IFACE" -p tcp -m conntrack --ctorigdstport "$port" --ctdir ORIGINAL -j "$CHAIN"
    done
  done
}

if [ "${1:-}" = "remove" ]; then
  unhook; iptables -F "$CHAIN" 2>/dev/null || true; iptables -X "$CHAIN" 2>/dev/null || true
  echo "Origin lock removed: ports 80/443 are open to everyone again."; exit 0
fi

RANGES=$(curl -fsS --max-time 15 https://www.cloudflare.com/ips-v4 2>/dev/null | tr -d '\r' | grep -E '^[0-9]{1,3}(\.[0-9]{1,3}){3}/[0-9]{1,2}$' || true)
if [ "$(printf '%s\n' "$RANGES" | grep -c .)" -lt 10 ]; then
  echo "Could not download the Cloudflare list; using the built-in copy."; RANGES=$(printf '%s\n' $FALLBACK)
fi

iptables -N DOCKER-USER 2>/dev/null || true
iptables -N "$CHAIN" 2>/dev/null || true
iptables -F "$CHAIN"
for range in $RANGES; do iptables -A "$CHAIN" -s "$range" -j RETURN; done
iptables -A "$CHAIN" -m limit --limit 6/min -j LOG --log-prefix "bpn-origin-drop: " --log-level 4
iptables -A "$CHAIN" -j DROP

unhook
for port in 443 80; do
  iptables -I DOCKER-USER 1 -i "$IFACE" -p tcp -m conntrack --ctorigdstport "$port" --ctdir ORIGINAL -j "$CHAIN"
done
echo "Origin lock active: $(printf '%s\n' $RANGES | grep -c .) Cloudflare ranges allowed on ports 80/443 via $IFACE."
