#!/bin/bash
# Create a VPN profile for one admin device.
#   sudo bash vpn-add-client.sh admin-phone
# Writes /etc/wireguard/clients/<name>.conf and <name>.png (QR code for the app).
set -eu
NAME="${1:?Usage: vpn-add-client.sh <device-name>}"
case "$NAME" in *[!a-zA-Z0-9-]*|'') echo "Use letters, numbers and dashes only."; exit 1;; esac
NET=10.66.66
PORT="${BPN_VPN_PORT:-51820}"
ENDPOINT="${BPN_VPN_ENDPOINT:-$(ip -4 -o addr show "${BPN_PUBLIC_IFACE:-eth0}" | awk '{print $4}' | cut -d/ -f1 | head -1)}"
umask 077
DIR=/etc/wireguard/clients
[ -f "$DIR/$NAME.conf" ] && { echo "$NAME already exists: $DIR/$NAME.conf"; exit 0; }
USED=$(grep -ho "AllowedIPs = $NET\.[0-9]*" /etc/wireguard/wg0.conf | awk -F. '{print $4}' | sort -n)
HOST=2; while printf '%s\n' $USED | grep -qx "$HOST"; do HOST=$((HOST+1)); done
[ "$HOST" -lt 255 ] || { echo "No free VPN addresses."; exit 1; }
KEY=$(wg genkey); PUB=$(printf '%s' "$KEY" | wg pubkey); PSK=$(wg genpsk)
cat >> /etc/wireguard/wg0.conf <<CONF

[Peer]
# $NAME
PublicKey = $PUB
PresharedKey = $PSK
AllowedIPs = $NET.$HOST/32
CONF
cat > "$DIR/$NAME.conf" <<CONF
[Interface]
PrivateKey = $KEY
Address = $NET.$HOST/32
DNS = 1.1.1.1, 1.0.0.1

[Peer]
PublicKey = $(cat /etc/wireguard/server.pub)
PresharedKey = $PSK
Endpoint = $ENDPOINT:$PORT
# All traffic through New York. IPv6 is routed in too so it cannot leak your real country.
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25
CONF
qrencode -t png -s 8 -m 3 -o "$DIR/$NAME.png" -r "$DIR/$NAME.conf"
wg syncconf wg0 <(wg-quick strip wg0) 2>/dev/null || systemctl restart wg-quick@wg0
echo "Created $NAME ($NET.$HOST): $DIR/$NAME.conf and $DIR/$NAME.png"
