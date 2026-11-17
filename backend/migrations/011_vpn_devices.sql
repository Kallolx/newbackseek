-- Admin VPN devices. The server applies this list to WireGuard every few seconds
-- (ops/security/vpn-sync.sh). Private keys are shown once and never stored.
CREATE TABLE IF NOT EXISTS vpn_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (name ~ '^[A-Za-z0-9 ._-]{1,40}$'),
  address text NOT NULL UNIQUE CHECK (address ~ '^10\.66\.66\.([2-9]|[1-9][0-9]|1[0-9][0-9]|2[0-4][0-9]|25[0-4])$'),
  public_key text NOT NULL UNIQUE CHECK (public_key ~ '^[A-Za-z0-9+/]{43}=$'),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_handshake_at timestamptz,
  rx_bytes bigint NOT NULL DEFAULT 0,
  tx_bytes bigint NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS vpn_server (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  public_key text,
  listen_port integer,
  heartbeat_at timestamptz
);
INSERT INTO vpn_server (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
