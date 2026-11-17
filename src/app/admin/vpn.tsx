'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Anchor, Badge, Button, Group, List, Modal, Paper, Skeleton, Stack, Text, TextInput, Title } from '@mantine/core';
import { FiAlertTriangle, FiCopy, FiDownload, FiGlobe, FiPlus, FiSmartphone, FiTrash2, FiWifi } from 'react-icons/fi';
import { adminApi, useAdminResource } from './live-api';
import { toast } from '../../components/toast';
import { EmptyState } from '../../components/page-state';
import styles from './security.module.css';

type Device = { id: string; name: string; address: string; createdAt: string; createdBy: string | null; lastHandshakeAt: string | null; online: boolean; rxBytes: number; txBytes: number };
type Vpn = { server: { ready: boolean; online: boolean; address: string; port: number | null; checkedAt: string | null }; you: { ip: string; onVpn: boolean }; devices: Device[]; maxDevices: number };
type Created = { device: Device; config: string; qrSvg: string; fileName: string };

const size = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(0)} KB` : bytes < 1073741824 ? `${(bytes / 1048576).toFixed(1)} MB` : `${(bytes / 1073741824).toFixed(2)} GB`;
function ago(value: string | null) {
  if (!value) return 'Never connected';
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return 'Active now';
  if (minutes < 60) return `Last active ${minutes} min ago`;
  if (minutes < 1440) return `Last active ${Math.round(minutes / 60)} h ago`;
  return `Last active ${new Date(value).toLocaleDateString()}`;
}

export function VpnCenter() {
  const { data, loading, error, reload } = useAdminResource<Vpn>('/admin/vpn');
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [removing, setRemoving] = useState<Device | null>(null);
  useEffect(() => { const timer = setInterval(reload, 15000); return () => clearInterval(timer); }, [reload]);

  if (!data && loading) return <Stack>{[0, 1, 2].map(i => <Skeleton key={i} height={110} radius="md" />)}</Stack>;
  if (error || !data) return <EmptyState title="VPN status could not load" description="Retry to load the VPN devices." action="Retry" onAction={reload} />;
  const connected = data.devices.filter(device => device.online).length;

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try { const result = await adminApi<Created>('/admin/vpn/devices', { method: 'POST', body: JSON.stringify({ name: name.trim() }) }); setCreated(result); setAdding(false); setName(''); reload(); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : 'Could not add the device.'); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!removing) return;
    setBusy(true);
    try { await adminApi(`/admin/vpn/devices/${removing.id}`, { method: 'DELETE' }); toast.success(`${removing.name} removed. It is disconnected within seconds.`); setRemoving(null); reload(); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : 'Could not remove the device.'); }
    finally { setBusy(false); }
  }
  function download() {
    if (!created) return;
    const url = URL.createObjectURL(new Blob([created.config], { type: 'text/plain' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: created.fileName });
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <Stack gap="md" className={styles.page}>
    <Text size="sm" c="dimmed">Connect a phone or laptop to the server’s New York connection. Everything on that device (this site, other websites and apps) then goes out through New York, so country blocking never affects you.</Text>

    <Paper withBorder radius="md" className={styles.status}>
      <div className={styles.statusRow}><span className={styles.statusIcon}><FiWifi /></span><div className={styles.statusText}><Text size="sm" fw={600}>VPN server</Text><Text size="xs" c="dimmed">{data.server.address ? `${data.server.address}${data.server.port ? ':' + data.server.port : ''} · New York, USA` : 'Not set up'}</Text></div><Badge color={data.server.online ? 'teal' : 'red'} variant="light">{data.server.online ? 'Online' : 'Offline'}</Badge></div>
      <div className={styles.statusRow}><span className={styles.statusIcon}><FiSmartphone /></span><div className={styles.statusText}><Text size="sm" fw={600}>Devices</Text><Text size="xs" c="dimmed">{data.devices.length} of {data.maxDevices} · {connected} active now</Text></div></div>
      <div className={styles.statusRow}><span className={styles.statusIcon}><FiGlobe /></span><div className={styles.statusText}><Text size="sm" fw={600}>This device</Text><Text size="xs" c="dimmed">{data.you.ip || 'Unknown IP'}</Text></div><Badge color={data.you.onVpn ? 'teal' : 'gray'} variant="light">{data.you.onVpn ? 'On the VPN' : 'Not on the VPN'}</Badge></div>
    </Paper>

    {!data.server.online && <Alert color="red" icon={<FiAlertTriangle />} className={styles.alert} title="VPN server is not responding">Devices cannot connect right now. The server reports in every few seconds; if this stays red, the VPN service on the server needs a restart.</Alert>}

    <Group justify="space-between" align="center">
      <Title order={3} size="h5">Your devices</Title>
      <Button leftSection={<FiPlus />} disabled={!data.server.ready || data.devices.length >= data.maxDevices} onClick={() => setAdding(true)}>Add device</Button>
    </Group>

    {data.devices.length ? <Stack gap="sm">{data.devices.map(device => <Paper key={device.id} withBorder radius="md" className={styles.section}>
      <Group justify="space-between" wrap="nowrap" align="flex-start" gap="sm">
        <div className={styles.statusText}>
          <Group gap={8} wrap="nowrap"><Text fw={600} truncate>{device.name}</Text>{device.online && <Badge color="teal" variant="light" size="sm">Active</Badge>}</Group>
          <Text size="xs" c="dimmed">{ago(device.lastHandshakeAt)}</Text>
          <Text size="xs" c="dimmed">↓ {size(device.txBytes)} · ↑ {size(device.rxBytes)} · {device.address}</Text>
          <Text size="xs" c="dimmed">Added {new Date(device.createdAt).toLocaleDateString()}{device.createdBy ? ` by ${device.createdBy}` : ''}</Text>
        </div>
        <Button color="red" variant="light" size="compact-sm" leftSection={<FiTrash2 />} onClick={() => setRemoving(device)}>Remove</Button>
      </Group>
    </Paper>)}</Stack> : <Paper withBorder radius="md" className={styles.section}><Text size="sm" c="dimmed">No devices yet. Add your phone or laptop to start.</Text></Paper>}

    <Paper withBorder radius="md" className={styles.section}>
      <Title order={3} size="h5" mb="xs">How to connect</Title>
      <List size="sm" spacing={6} type="ordered">
        <List.Item>Install the free <b>WireGuard</b> app: <Anchor href="https://www.wireguard.com/install/" target="_blank" rel="noreferrer">wireguard.com/install</Anchor> (Android, iPhone, Windows, Mac).</List.Item>
        <List.Item>Tap <b>Add device</b> here and give it a name, e.g. “Office laptop”.</List.Item>
        <List.Item>Phone: in the app tap <b>+</b> → <b>Scan from QR code</b>. Laptop: <b>Import tunnel from file</b> with the downloaded file.</List.Item>
        <List.Item>Switch the tunnel on. This page then shows the device as <b>Active</b>.</List.Item>
      </List>
      <Text size="xs" c="dimmed" mt="sm">Lost a phone? Remove it here; it is cut off within seconds.</Text>
    </Paper>

    <Modal opened={adding} onClose={() => setAdding(false)} title="Add a device" centered>
      <form onSubmit={create}><Stack>
        <TextInput label="Device name" description="So you can recognise it later." placeholder="e.g. Office laptop" value={name} onChange={event => setName(event.currentTarget.value)} maxLength={40} required data-autofocus />
        <Group justify="flex-end" grow><Button variant="default" onClick={() => setAdding(false)}>Cancel</Button><Button type="submit" loading={busy} disabled={!name.trim()}>Create</Button></Group>
      </Stack></form>
    </Modal>

    <Modal opened={Boolean(created)} onClose={() => setCreated(null)} title={created ? `Connect ${created.device.name}` : ''} centered closeOnClickOutside={false}>
      {created && <Stack gap="sm">
        <Alert color="yellow" icon={<FiAlertTriangle />} className={styles.alert}>Scan or download it now. For security this setup is shown only once; if you lose it, remove the device and add it again.</Alert>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.qr} src={`data:image/svg+xml;utf8,${encodeURIComponent(created.qrSvg)}`} alt={`VPN QR code for ${created.device.name}`} />
        <Text size="xs" c="dimmed" ta="center">Another device: WireGuard app → + → Scan from QR code. This phone: tap Download file, then in WireGuard → + → Import from file.</Text>
        <Group grow>
          <Button variant="default" leftSection={<FiDownload />} onClick={download}>Download file</Button>
          <Button variant="default" leftSection={<FiCopy />} onClick={async () => { try { await navigator.clipboard.writeText(created.config); toast.success('Setup copied.'); } catch { toast.error('Copy is not available here; use Download.'); } }}>Copy</Button>
        </Group>
        <Button onClick={() => setCreated(null)}>Done</Button>
      </Stack>}
    </Modal>

    <Modal opened={Boolean(removing)} onClose={() => setRemoving(null)} title="Remove this device?" centered>
      <Stack gap="sm">
        <Text size="sm"><b>{removing?.name}</b> will be disconnected within seconds and can no longer use the VPN.</Text>
        <Group justify="flex-end" grow><Button variant="default" onClick={() => setRemoving(null)}>Keep</Button><Button color="red" loading={busy} onClick={remove}>Remove device</Button></Group>
      </Stack>
    </Modal>
  </Stack>;
}
