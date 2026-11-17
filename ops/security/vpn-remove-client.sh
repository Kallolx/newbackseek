#!/bin/bash
# Revoke a lost or retired device immediately.
#   sudo bash vpn-remove-client.sh admin-phone
set -eu
NAME="${1:?Usage: vpn-remove-client.sh <device-name>}"
case "$NAME" in *[!a-zA-Z0-9-]*|'') echo "Use letters, numbers and dashes only."; exit 1;; esac
python3 - "$NAME" <<'PY'
import re, sys
name = sys.argv[1]; path = '/etc/wireguard/wg0.conf'
text = open(path).read()
blocks = re.split(r'\n(?=\[Peer\])', text)
kept = [b for b in blocks if not b.startswith('[Peer]\n# ' + name + '\n')]
if len(kept) == len(blocks): sys.exit('No device named ' + name)
open(path, 'w').write('\n'.join(kept).rstrip() + '\n')
PY
rm -f "/etc/wireguard/clients/$NAME.conf" "/etc/wireguard/clients/$NAME.png"
wg syncconf wg0 <(wg-quick strip wg0)
echo "Removed $NAME. That device can no longer connect."
