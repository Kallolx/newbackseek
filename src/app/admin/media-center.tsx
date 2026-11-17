'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { Badge, Button, Group, Modal, Pagination, Paper, Progress, SegmentedControl, SimpleGrid, Skeleton, Stack, Text, TextInput, Title } from '@mantine/core';
import { BarChart } from '@mantine/charts';
import { FiActivity, FiCloud, FiCpu, FiDatabase, FiImage, FiLock, FiRefreshCw, FiSearch, FiTrash2, FiTrendingDown } from 'react-icons/fi';
import { adminApi, useAdminResource } from './live-api';
import { toast } from '../../components/toast';
import { EmptyState } from '../../components/page-state';
import styles from './security.module.css';

type Check = { ok: boolean; ms: number; error?: string };
type Storage = {
  health: { public: Check; private: Check; delivery: Check; worker: { waiting: number; active: number; failed: number; delayed: number } | null; lastProcessedAt: string | null; averageProcessingSeconds: number | null; mediaHost: string };
  pictures: { ready: number; in_ads: number; unattached: number; in_progress: number; failed: number; ads_with_pictures: number };
  bytes: { original: number; uploaded: number; stored: number; saved: number; savedPercent: number; measured: number };
  variants: { size: string; files: number; bytes: number; average: number; width: number }[];
  daily: { day: string; pictures: number; bytes: number }[];
  verification: { total: number; bytes: number };
  buckets: { public: { objects: number; bytes: number } | null; private: { objects: number; bytes: number } | null; scannedAt: string | null };
};
type Row = { id: string; ad_id: string | null; ad_status: string | null; title: string | null; owner: string; status: string; created_at: string; expected_bytes: number; original_bytes: number | null; stored_bytes: number; width: number | null; height: number | null };
type List = { items: Row[]; total: number };

export const formatBytes = (value: number | null | undefined) => {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
};
const ago = (value: string | null) => { if (!value) return 'never'; const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000); return minutes < 1 ? 'just now' : minutes < 60 ? `${minutes} min ago` : minutes < 1440 ? `${Math.round(minutes / 60)} h ago` : new Date(value).toLocaleDateString(); };
const sizeLabel: Record<string, string> = { full: 'Full (ad page, up to 1280 px)', card: 'Card (lists, 480 px)', thumb: 'Thumbnail (160 px)' };
const statusColor: Record<string, string> = { ready: 'teal', failed: 'red', queued: 'yellow', processing: 'yellow', uploading: 'gray' };

function HealthRow({ icon, label, check, detail }: { icon: ReactNode; label: string; check: { ok: boolean; text: string }; detail: string }) {
  return <div className={styles.statusRow}><span className={styles.statusIcon}>{icon}</span><div className={styles.statusText}><Text size="sm" fw={600}>{label}</Text><Text size="xs" c="dimmed">{detail}</Text></div><Badge color={check.ok ? 'teal' : 'red'} variant="light">{check.text}</Badge></div>;
}
function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return <Paper withBorder radius="md" p="sm"><Text size="xs" c="dimmed">{label}</Text><Text fw={700} size="lg">{value}</Text>{hint && <Text size="xs" c="dimmed">{hint}</Text>}</Paper>;
}

export function MediaCenter() {
  const [scan, setScan] = useState(0);
  const report = useAdminResource<Storage>(`/admin/storage${scan ? `?scan=1&t=${scan}` : ''}`);
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const list = useAdminResource<List>(`/admin/media?page=${page}&search=${encodeURIComponent(debounced)}&status=${status}`);
  const [removing, setRemoving] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { const timer = setTimeout(() => { setDebounced(query.trim()); setPage(1); }, 300); return () => clearTimeout(timer); }, [query]);

  async function remove() {
    if (!removing) return;
    setBusy(true);
    try { await adminApi(`/admin/media/${removing.id}`, { method: 'DELETE' }); toast.success('Picture deleted from storage.'); setRemoving(null); list.reload(); report.reload(); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : 'Could not delete the picture.'); }
    finally { setBusy(false); }
  }

  const data = report.data;
  return <Stack gap="md" className={styles.page}>
    <Group justify="flex-end">
      <Button variant="default" size="xs" leftSection={<FiRefreshCw />} loading={report.loading && Boolean(scan)} onClick={() => setScan(Date.now())}>Rescan storage</Button>
    </Group>

    {!data && report.loading ? <Stack>{[0, 1, 2].map(i => <Skeleton key={i} height={120} radius="md" />)}</Stack>
      : report.error || !data ? <EmptyState title="Storage report could not load" description="Retry to load the storage overview." action="Retry" onAction={report.reload} />
      : <>
        <Paper withBorder radius="md" className={styles.status}>
          <HealthRow icon={<FiCloud />} label="Public storage (processed pictures)" check={{ ok: data.health.public.ok, text: data.health.public.ok ? `OK · ${data.health.public.ms} ms` : data.health.public.error || 'Down' }} detail="R2 bucket served to visitors" />
          <HealthRow icon={<FiLock />} label="Private storage (uploads, verification)" check={{ ok: data.health.private.ok, text: data.health.private.ok ? `OK · ${data.health.private.ms} ms` : data.health.private.error || 'Down' }} detail="Never publicly reachable" />
          <HealthRow icon={<FiImage />} label="Picture delivery" check={{ ok: data.health.delivery.ok, text: data.health.delivery.ok ? (data.health.delivery.ms ? `OK · ${data.health.delivery.ms} ms` : 'OK') : data.health.delivery.error || 'Down' }} detail={`${data.health.mediaHost} · how visitors load pictures`} />
          <HealthRow icon={<FiCpu />} label="Image processing" check={{ ok: Boolean(data.health.worker) && (data.health.worker?.failed || 0) === 0, text: !data.health.worker ? 'Unknown' : data.health.worker.failed ? `${data.health.worker.failed} failed` : data.health.worker.waiting + data.health.worker.active ? `${data.health.worker.waiting + data.health.worker.active} in queue` : 'Idle' }} detail={`Last picture processed ${ago(data.health.lastProcessedAt)}${data.health.averageProcessingSeconds != null ? ` · average ${data.health.averageProcessingSeconds} s from upload to ready` : ''}`} />
        </Paper>

        <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }} spacing="sm">
          <Stat label="Pictures ready" value={data.pictures.ready.toLocaleString()} />
          <Stat label="In ads" value={data.pictures.in_ads.toLocaleString()} hint={`${data.pictures.ads_with_pictures} ads`} />
          <Stat label="Not in an ad" value={data.pictures.unattached.toLocaleString()} hint="Abandoned ones are removed after 24 h" />
          <Stat label="Processing now" value={data.pictures.in_progress} />
          <Stat label="Failed" value={data.pictures.failed} />
          <Stat label="Verification photos" value={data.verification.total} hint={`${formatBytes(data.verification.bytes)} · private`} />
        </SimpleGrid>

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          <Paper withBorder radius="md" className={styles.section}>
            <Group gap={8} mb="sm"><span className={styles.sectionIcon}><FiDatabase /></span><Title order={3} size="h5">Storage used (R2)</Title></Group>
            <Stack gap="sm">
              <div><Group justify="space-between"><Text size="sm">Public bucket</Text><Text size="sm" fw={700}>{data.buckets.public ? formatBytes(data.buckets.public.bytes) : '—'}</Text></Group><Text size="xs" c="dimmed">{data.buckets.public ? `${data.buckets.public.objects.toLocaleString()} files (3 sizes per picture)` : 'Could not scan'}</Text></div>
              <div><Group justify="space-between"><Text size="sm">Private bucket</Text><Text size="sm" fw={700}>{data.buckets.private ? formatBytes(data.buckets.private.bytes) : '—'}</Text></Group><Text size="xs" c="dimmed">{data.buckets.private ? `${data.buckets.private.objects.toLocaleString()} files (verification photos, uploads waiting to process)` : 'Could not scan'}</Text></div>
              <Group justify="space-between"><Text size="sm" fw={600}>Total</Text><Text size="sm" fw={700}>{formatBytes((data.buckets.public?.bytes || 0) + (data.buckets.private?.bytes || 0))}</Text></Group>
              <Text size="xs" c="dimmed">Measured from the buckets {ago(data.buckets.scannedAt)} (refreshed at most every 10 minutes; Rescan updates it now). Cloudflare R2 includes 10 GB free.</Text>
            </Stack>
          </Paper>

          <Paper withBorder radius="md" className={styles.section}>
            <Group gap={8} mb="sm"><span className={styles.sectionIcon}><FiTrendingDown /></span><Title order={3} size="h5">Space saved by processing</Title></Group>
            <Stack gap="xs">
              <Group justify="space-between"><Text size="sm">Original photos from phones</Text><Text size="sm" fw={600}>{formatBytes(data.bytes.original)}</Text></Group>
              <Group justify="space-between"><Text size="sm">Uploaded after shrinking on the phone</Text><Text size="sm" fw={600}>{formatBytes(data.bytes.uploaded)}</Text></Group>
              <Group justify="space-between"><Text size="sm">Stored (all 3 sizes, originals deleted)</Text><Text size="sm" fw={600}>{formatBytes(data.bytes.stored)}</Text></Group>
              <Progress value={data.bytes.original ? Math.min(100, (data.bytes.stored / data.bytes.original) * 100) : 0} color="teal" size="lg" radius="xl" aria-label="Stored compared with original size" />
              <Text size="sm" fw={700} c="teal.7">Saved {formatBytes(data.bytes.saved)} ({data.bytes.savedPercent}%)</Text>
              <Text size="xs" c="dimmed">Original camera sizes are recorded from today on ({data.bytes.measured} of {data.pictures.ready} pictures so far). Older pictures count at their uploaded size, so the real saving is higher.</Text>
            </Stack>
          </Paper>
        </SimpleGrid>

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          <Paper withBorder radius="md" className={styles.section}>
            <Group gap={8} mb="sm"><span className={styles.sectionIcon}><FiImage /></span><Title order={3} size="h5">Stored sizes</Title></Group>
            {data.variants.length ? <div className={styles.stats}>{data.variants.map(row => <div key={row.size} className={styles.statRow}><div><Text size="sm">{sizeLabel[row.size] || row.size}</Text><Text size="xs" c="dimmed">{row.files.toLocaleString()} files · average {formatBytes(row.average)}</Text></div><Text size="sm" fw={700}>{formatBytes(row.bytes)}</Text></div>)}</div> : <Text size="sm" c="dimmed">No processed pictures yet.</Text>}
          </Paper>
          <Paper withBorder radius="md" className={styles.section}>
            <Group gap={8} mb="sm"><span className={styles.sectionIcon}><FiActivity /></span><Title order={3} size="h5">New pictures · last 14 days</Title></Group>
            <BarChart h={180} data={data.daily.map(row => ({ day: row.day.slice(5), Pictures: row.pictures }))} dataKey="day" series={[{ name: 'Pictures', color: 'indigo.6' }]} tickLine="none" gridAxis="y" />
          </Paper>
        </SimpleGrid>
      </>}

    <Paper withBorder radius="md" className={styles.section}>
      <Stack gap="sm">
        <Title order={3} size="h5">All pictures</Title>
        <TextInput leftSection={<FiSearch />} placeholder="Search by ad title, ad ID, owner or picture ID" value={query} onChange={event => setQuery(event.currentTarget.value)} />
        <SegmentedControl fullWidth size="xs" value={status} onChange={value => { setStatus(value); setPage(1); }} data={[{ value: '', label: 'All' }, { value: 'ready', label: 'Ready' }, { value: 'processing', label: 'Processing' }, { value: 'failed', label: 'Failed' }]} />
        {list.loading && !list.data ? <Skeleton height={200} /> : list.data?.items.length ? <div className={styles.stats}>
          {list.data.items.map(row => <div key={row.id} className={styles.statRow}>
            <div className={styles.statusText}>
              <Group gap={6} wrap="nowrap"><Badge size="sm" variant="light" color={statusColor[row.status] || 'gray'}>{row.status}</Badge><Text size="sm" fw={600} truncate>{row.title ? `#${row.ad_id} ${row.title}` : row.ad_id ? `Ad #${row.ad_id}` : 'Not in an ad'}</Text></Group>
              <Text size="xs" c="dimmed">{row.owner} · {new Date(row.created_at).toLocaleString()}{row.width ? ` · ${row.width}×${row.height}` : ''}</Text>
              <Text size="xs" c="dimmed">Stored {formatBytes(row.stored_bytes)}{row.original_bytes ? ` · original ${formatBytes(row.original_bytes)}` : ` · uploaded ${formatBytes(row.expected_bytes)}`} · {row.id.slice(0, 8)}</Text>
            </div>
            <Button color="red" variant="subtle" size="compact-sm" aria-label="Delete picture" disabled={['queued', 'processing'].includes(row.status)} onClick={() => setRemoving(row)}><FiTrash2 /></Button>
          </div>)}
        </div> : <Text size="sm" c="dimmed" py="md">No pictures match.</Text>}
        {list.data && list.data.total > 50 && <Pagination size="sm" total={Math.ceil(list.data.total / 50)} value={page} onChange={setPage} />}
      </Stack>
    </Paper>

    <Modal opened={Boolean(removing)} onClose={() => setRemoving(null)} title="Delete this picture?" centered>
      <Stack gap="sm">
        <Text size="sm">All stored sizes are removed from storage{removing?.ad_id ? ` and it disappears from ad #${removing.ad_id}` : ''}. This cannot be undone.</Text>
        <Group justify="flex-end" grow><Button variant="default" onClick={() => setRemoving(null)}>Keep</Button><Button color="red" loading={busy} onClick={remove}>Delete picture</Button></Group>
      </Stack>
    </Modal>
  </Stack>;
}
