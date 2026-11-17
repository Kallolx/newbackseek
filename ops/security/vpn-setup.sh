#!/bin/sh
# Admin VPN (WireGuard) on this VPS. Admins connect from anywhere and browse
# from the server's New York address, so country blocking never affects them.
# WireGuard stays silent to anyone without a key: scanners cannot see it.
#   sudo sh vpn-setup.sh            (safe to re-run)
set -eu
PORT="${BPN_VPN_PORT:-51820}"
NET=10.66.66
IFACE="${BPN_PUBLIC_IFACE:-eth0}"
export DEBIAN_FRONTEND=noninteractive
command -v wg >/dev/null 2>&1 && command -v qrencode >/dev/null 2>&1 || { apt-get update -qq; apt-get install -y -qq wireguard qrencode >/dev/null; }
umask 077
mkdir -p /etc/wireguard/clients
[ -f /etc/wireguard/server.key ] || wg genkey > /etc/wireguard/server.key
wg pubkey < /etc/wireguard/server.key > /etc/wireguard/server.pub
if [ ! -f /etc/wireguard/wg0.conf ]; then
  cat > /etc/wireguard/wg0.conf <<CONF
[Interface]
Address = $NET.1/24
ListenPort = $PORT
PrivateKey = $(cat /etc/wireguard/server.key)
# Docker sets the FORWARD policy to DROP, so VPN traffic is allowed explicitly.
PostUp = iptables -I FORWARD 1 -i wg0 -o $IFACE -j ACCEPT; iptables -I FORWARD 1 -i $IFACE -o wg0 -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT; iptables -t nat -A POSTROUTING -s $NET.0/24 -o $IFACE -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -o $IFACE -j ACCEPT; iptables -D FORWARD -i $IFACE -o wg0 -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT; iptables -t nat -D POSTROUTING -s $NET.0/24 -o $IFACE -j MASQUERADE
CONF
fi
printf 'net.ipv4.ip_forward = 1\n' > /etc/sysctl.d/90-bpn-vpn.conf
sysctl -q -p /etc/sysctl.d/90-bpn-vpn.conf
ufw allow "$PORT/udp" comment 'BackpageNew admin VPN' >/dev/null
systemctl enable --now wg-quick@wg0 >/dev/null 2>&1 || systemctl restart wg-quick@wg0
echo "Admin VPN running on UDP $PORT ($(wg show wg0 peers | wc -l) device(s))."
