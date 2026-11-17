#!/bin/bash
# Applies the admin panel's VPN device list (table vpn_devices) to WireGuard and
# reports server/device status back. Runs as bpn-vpn-sync.service.
#   bash vpn-sync.sh          one pass
#   bash vpn-sync.sh --loop   every 5 seconds (service mode)
set -u
DB_CONTAINER="${BPN_DB_CONTAINER:-app-db-1}"
IFACE=wg0
KEY_RE='^[A-Za-z0-9+/]{43}=$'
ADDR_RE='^10\.66\.66\.([2-9]|[1-9][0-9]|1[0-9][0-9]|2[0-4][0-9]|25[0-4])$'
psql_db() { docker exec -i "$DB_CONTAINER" psql -U backpagenew -d backpagenew -v ON_ERROR_STOP=1 -AtF '|' "$@"; }

sync_once() {
  wg show "$IFACE" >/dev/null 2>&1 || return 0
  # Never touch peers if the list cannot be read (DB restarting, deploy in progress).
  local rows; rows=$(psql_db -c "select public_key,address from vpn_devices") || return 0
  declare -A want=()
  while IFS='|' read -r key addr; do
    [[ -z "$key" ]] && continue
    [[ "$key" =~ $KEY_RE && "$addr" =~ $ADDR_RE ]] || continue
    want["$key"]="$addr"
  done <<< "$rows"
  for key in "${!want[@]}"; do
    wg set "$IFACE" peer "$key" allowed-ips "${want[$key]}/32" persistent-keepalive 0
  done
  for key in $(wg show "$IFACE" peers); do
    [[ -n "${want[$key]+x}" ]] || wg set "$IFACE" peer "$key" remove
  done

  # Status back to the admin panel (validated numbers and keys only).
  local pub port values="" hs rx tx
  pub=$(wg show "$IFACE" public-key); port=$(wg show "$IFACE" listen-port)
  [[ "$pub" =~ $KEY_RE && "$port" =~ ^[0-9]+$ ]] || return 0
  while IFS=$'\t' read -r key _psk _endpoint _ips hs rx tx _ka; do
    [[ "$key" =~ $KEY_RE && "$hs" =~ ^[0-9]+$ && "$rx" =~ ^[0-9]+$ && "$tx" =~ ^[0-9]+$ ]] || continue
    values+="${values:+,}('$key',$hs,$rx,$tx)"
  done < <(wg show "$IFACE" dump | tail -n +2)
  {
    echo "update vpn_server set public_key='$pub',listen_port=$port,heartbeat_at=now() where id=1;"
    [[ -n "$values" ]] && echo "update vpn_devices d set last_handshake_at=case when v.hs>0 then to_timestamp(v.hs) end,rx_bytes=v.rx,tx_bytes=v.tx from (values $values) v(pk,hs,rx,tx) where d.public_key=v.pk;"
  } | psql_db -q >/dev/null 2>&1 || true
}

if [[ "${1:-}" == "--loop" ]]; then
  while true; do sync_once; sleep 5; done
else
  sync_once
fi
