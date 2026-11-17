'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Accordion, ActionIcon, Alert, Badge, Button, Checkbox, Group, Menu, Modal, Pagination, Paper, Progress, Select, SimpleGrid, Skeleton, Stack, Text, TextInput, Title, UnstyledButton } from '@mantine/core';
import { BarChart } from '@mantine/charts';
import { FiAlertTriangle, FiCheckCircle, FiCloud, FiCopy, FiCpu, FiImage, FiLock, FiMoreVertical, FiRefreshCw, FiRotateCw, FiSearch, FiSettings, FiTrash2, FiX, FiXCircle } from 'react-icons/fi';
import { adminApi, useAdminResource } from './live-api';
import { toast } from '../../components/toast';
import { EmptyState } from '../../components/page-state';
import styles from './media-center.module.css';

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
type Picture = { id: string; ad_id: string | null; ad_status: string | null; title: string | null; owner: string; status: string; created_at: string; expected_bytes: number; original_bytes: number | null; stored_bytes: number; width: number | null; height: number | null };
type Pictures = { items: Picture[]; total: number; page: number; pageSize: number; counts: { all: number; ready: number; processing: number; failed: number; in_ad: number; not_in_ad: number } };

const PAGE_SIZE = 20;
const FREE_TIER = 10 * 1073741824;
export const formatBytes = (value: number | null | undefined) => {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
};
const ago = (value: string | null) => {
  if (!value) return 'never';
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} h ago`;
  if (minutes < 10080) return `${Math.round(minutes / 1440)} d ago`;
  return new Date(value).toLocaleDateString();
};
const STATUS: Record<string, { label: string; color: string }> = {
  ready: { label: 'Ready', color: 'teal' }, failed: { label: 'Failed', color: 'red' },
  queued: { label: 'Processing', color: 'yellow' }, processing: { label: 'Processing', color: 'yellow' }, uploading: { label: 'Uploading', color: 'gray' },
};
const sizeLabel: Record<string, string> = { full: 'Large (ad page)', card: 'Medium (lists)', thumb: 'Small (thumbnails)' };

function Tile({ icon, label, value, hint, children }: { icon: ReactNode; label: string; value: string; hint?: string; children?: ReactNode }) {
  return <Paper withBorder radius="md" className={styles.tile}>
    <Group gap={8} wrap="nowrap"><span className={styles.tileIcon}>{icon}</span><Text size="xs" c="dimmed" fw={600}>{label}</Text></Group>
    <Text className={styles.tileValue}>{value}</Text>
    {hint && <Text size="xs" c="dimmed">{hint}</Text>}
    {children}
  </Paper>;
}

function TechRow({ icon, label, detail, ok, text }: { icon: ReactNode; label: string; detail: string; ok: boolean; text: string }) {
  return <div className={styles.techRow}><span className={styles.tileIcon}>{icon}</span><div className={styles.grow}><Text size="sm" fw={600}>{label}</Text><Text size="xs" c="dimmed">{detail}</Text></div><Badge color={ok ? 'teal' : 'red'} variant="light">{text}</Badge></div>;
}

export function MediaCenter() {
  const [scan, setScan] = useState(0);
  const report = useAdminResource<Storage>(`/admin/storage${scan ? `?scan=1&t=${scan}` : ''}`);
  const [status, setStatus] = useState('');
  const [placement, setPlacement] = useState('');
  const [sort, setSort] = useState('newest');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<{ kind: 'delete' | 'retry'; ids: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const list = useAdminResource<Pictures>(`/admin/pictures?page=${page}&pageSize=${PAGE_SIZE}&search=${encodeURIComponent(search)}&status=${status}&placement=${placement}&sort=${sort}`);
  useEffect(() => { const timer = setTimeout(() => { setSearch(query.trim()); setPage(1); }, 300); return () => clearTimeout(timer); }, [query]);
  const change = (apply: () => void) => { apply(); setPage(1); setSelected(new Set()); };

  const data = report.data;
  const items = useMemo(() => list.data?.items ?? [], [list.data]);
  const pageIds = items.map(item => item.id);
  const allOnPage = pageIds.length > 0 && pageIds.every(id => selected.has(id));
  const someOnPage = pageIds.some(id => selected.has(id));
  const chosen = items.filter(item => selected.has(item.id));
  const failedChosen = chosen.filter(item => item.status === 'failed');
  const toggle = (id: string) => setSelected(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const togglePage = () => setSelected(current => { const next = new Set(current); pageIds.forEach(id => allOnPage ? next.delete(id) : next.add(id)); return next; });

  async function run() {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.kind === 'delete') {
        const result = await adminApi<{ deleted: number; skipped: number }>('/admin/pictures/delete', { method: 'POST', body: JSON.stringify({ ids: confirm.ids }) });
        toast.success(`${result.deleted} picture${result.deleted === 1 ? '' : 's'} deleted${result.skipped ? ` · ${result.skipped} still processing, skipped` : ''}.`);
      } else {
        const result = await adminApi<{ queued: number }>('/admin/pictures/retry', { method: 'POST', body: JSON.stringify({ ids: confirm.ids }) });
        toast.success(`${result.queued} picture${result.queued === 1 ? '' : 's'} sent for processing again.`);
      }
      setSelected(current => { const next = new Set(current); confirm.ids.forEach(id => next.delete(id)); return next; });
      setConfirm(null); list.reload(); report.reload();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'The action failed. Please retry.'); }
    finally { setBusy(false); }
  }
  const copy = async (text: string, what: string) => { try { await navigator.clipboard.writeText(text); toast.success(`${what} copied.`); } catch { toast.error('Copy is not available here.'); } };

  // Plain-language health for non-technical admins.
  const problems = !data ? [] : [
    !data.health.public.ok && 'Pictures cannot be saved or shown right now.',
    !data.health.delivery.ok && 'Visitors may not see pictures right now.',
    !data.health.private.ok && 'New uploads cannot be received right now.',
    data.pictures.failed > 0 && `${data.pictures.failed} picture${data.pictures.failed === 1 ? '' : 's'} could not be processed.`,
  ].filter(Boolean) as string[];
  const used = (data?.buckets.public?.bytes ?? data?.bytes.stored ?? 0) + (data?.buckets.private?.bytes ?? 0);
  const thisWeek = data?.daily.slice(-7).reduce((sum, row) => sum + row.pictures, 0) ?? 0;
  const from = list.data ? (list.data.page - 1) * list.data.pageSize + 1 : 0;
  const to = list.data ? Math.min(list.data.total, list.data.page * list.data.pageSize) : 0;
  const filtered = Boolean(search || status || placement);

  return <Stack gap="md" className={styles.page}>
    {!data && report.loading ? <Stack gap="sm"><Skeleton height={56} radius="md" /><SimpleGrid cols={{ base: 2, md: 4 }}>{[0, 1, 2, 3].map(i => <Skeleton key={i} height={104} radius="md" />)}</SimpleGrid></Stack>
      : report.error || !data ? <EmptyState title="Picture overview could not load" description="Retry to load the overview." action="Retry" onAction={report.reload} />
      : <>
        {problems.length
          ? <Alert color={!data.health.public.ok || !data.health.delivery.ok ? 'red' : 'yellow'} icon={<FiAlertTriangle />} title="Needs attention" className={styles.banner}>{problems.map(text => <div key={text}>{text}</div>)}{data.pictures.failed > 0 && <Button mt="xs" size="compact-sm" variant="white" onClick={() => change(() => setStatus('failed'))}>Show failed pictures</Button>}</Alert>
          : <Alert color="teal" icon={<FiCheckCircle />} title="Pictures are working normally" className={styles.banner}>Uploads are ready in about {data.health.averageProcessingSeconds ?? 2} seconds and visitors see pictures without delay.</Alert>}

        <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm">
          <Tile icon={<FiImage />} label="Pictures" value={data.pictures.ready.toLocaleString()} hint={`in ${data.pictures.ads_with_pictures} ad${data.pictures.ads_with_pictures === 1 ? '' : 's'}`} />
          <Tile icon={<FiCloud />} label="Space used" value={formatBytes(used)} hint={`of ${formatBytes(FREE_TIER)} free`}><Progress mt={8} size="sm" radius="xl" value={Math.max(1, Math.min(100, (used / FREE_TIER) * 100))} /></Tile>
          <Tile icon={<FiRotateCw />} label="Saved by optimizing" value={data.bytes.saved ? formatBytes(data.bytes.saved) : '—'} hint={data.bytes.saved ? `${data.bytes.savedPercent}% smaller than the originals` : 'Counting from new uploads'} />
          <Tile icon={<FiCheckCircle />} label="Added this week" value={thisWeek.toLocaleString()} hint={data.pictures.in_progress ? `${data.pictures.in_progress} processing now` : 'none processing now'} />
        </SimpleGrid>

        <Accordion variant="contained" radius="md" className={styles.accordion}>
          <Accordion.Item value="tech">
            <Accordion.Control icon={<FiSettings />}><Text size="sm" fw={600}>Technical details</Text><Text size="xs" c="dimmed">Storage, health checks and sizes, for troubleshooting</Text></Accordion.Control>
            <Accordion.Panel>
              <Stack gap="md">
                <div>
                  <TechRow icon={<FiCloud />} label="Public storage (R2)" detail="Processed pictures served to visitors" ok={data.health.public.ok} text={data.health.public.ok ? `OK · ${data.health.public.ms} ms` : data.health.public.error || 'Down'} />
                  <TechRow icon={<FiLock />} label="Private storage (R2)" detail="Uploads waiting to process, verification photos" ok={data.health.private.ok} text={data.health.private.ok ? `OK · ${data.health.private.ms} ms` : data.health.private.error || 'Down'} />
                  <TechRow icon={<FiImage />} label="Picture delivery" detail={data.health.mediaHost} ok={data.health.delivery.ok} text={data.health.delivery.ok ? (data.health.delivery.ms ? `OK · ${data.health.delivery.ms} ms` : 'OK') : data.health.delivery.error || 'Down'} />
                  <TechRow icon={<FiCpu />} label="Image worker" detail={`Last processed ${ago(data.health.lastProcessedAt)}`} ok={Boolean(data.health.worker) && !data.health.worker?.failed} text={!data.health.worker ? 'Unknown' : data.health.worker.waiting + data.health.worker.active ? `${data.health.worker.waiting + data.health.worker.active} queued` : 'Idle'} />
                </div>
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                  <div className={styles.kv}>
                    <Text size="xs" fw={700} c="dimmed" tt="uppercase">Storage buckets</Text>
                    <Group justify="space-between"><Text size="sm">Public</Text><Text size="sm" fw={600}>{data.buckets.public ? `${formatBytes(data.buckets.public.bytes)} · ${data.buckets.public.objects} files` : '—'}</Text></Group>
                    <Group justify="space-between"><Text size="sm">Private</Text><Text size="sm" fw={600}>{data.buckets.private ? `${formatBytes(data.buckets.private.bytes)} · ${data.buckets.private.objects} files` : '—'}</Text></Group>
                    <Group justify="space-between"><Text size="sm">Verification photos</Text><Text size="sm" fw={600}>{data.verification.total} · {formatBytes(data.verification.bytes)}</Text></Group>
                    <Group justify="space-between" align="center"><Text size="xs" c="dimmed">Measured {ago(data.buckets.scannedAt)}</Text><Button variant="subtle" size="compact-xs" leftSection={<FiRefreshCw />} loading={report.loading && Boolean(scan)} onClick={() => setScan(Date.now())}>Rescan</Button></Group>
                  </div>
                  <div className={styles.kv}>
                    <Text size="xs" fw={700} c="dimmed" tt="uppercase">Optimizing</Text>
                    <Group justify="space-between"><Text size="sm">Original photos</Text><Text size="sm" fw={600}>{formatBytes(data.bytes.original)}</Text></Group>
                    <Group justify="space-between"><Text size="sm">Uploaded (shrunk on phone)</Text><Text size="sm" fw={600}>{formatBytes(data.bytes.uploaded)}</Text></Group>
                    <Group justify="space-between"><Text size="sm">Stored (3 sizes)</Text><Text size="sm" fw={600}>{formatBytes(data.bytes.stored)}</Text></Group>
                    <Text size="xs" c="dimmed">Original sizes known for {data.bytes.measured} of {data.pictures.ready} pictures.</Text>
                  </div>
                  <div className={styles.kv}>
                    <Text size="xs" fw={700} c="dimmed" tt="uppercase">Stored sizes</Text>
                    {data.variants.map(row => <Group key={row.size} justify="space-between"><Text size="sm">{sizeLabel[row.size] || row.size}</Text><Text size="sm" fw={600}>{formatBytes(row.bytes)} · avg {formatBytes(row.average)}</Text></Group>)}
                  </div>
                  <div className={styles.kv}>
                    <Text size="xs" fw={700} c="dimmed" tt="uppercase">New pictures · 14 days</Text>
                    <BarChart h={140} data={data.daily.map(row => ({ day: row.day.slice(5), Pictures: row.pictures }))} dataKey="day" series={[{ name: 'Pictures', color: 'indigo.6' }]} tickLine="none" gridAxis="y" />
                  </div>
                </SimpleGrid>
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </>}

    <Paper withBorder radius="md" className={styles.listCard}>
      <div className={styles.listHead}>
        <Title order={3} size="h5">All pictures</Title>
        <TextInput className={styles.search} leftSection={<FiSearch />} placeholder="Search ad, owner or ID" value={query} onChange={event => setQuery(event.currentTarget.value)} rightSection={query ? <ActionIcon variant="subtle" size="sm" aria-label="Clear search" onClick={() => setQuery('')}><FiX /></ActionIcon> : null} />
      </div>
      <div className={styles.filters}>
        <div className={styles.chips} role="group" aria-label="Filter by status">
          {([['', 'All', list.data?.counts.all], ['ready', 'Ready', list.data?.counts.ready], ['processing', 'Processing', list.data?.counts.processing], ['failed', 'Failed', list.data?.counts.failed]] as const).map(([value, label, count]) =>
            <UnstyledButton key={value || 'all'} className={styles.chip} aria-pressed={status === value} data-active={status === value || undefined} data-tone={value === 'failed' && count ? 'red' : undefined} onClick={() => change(() => setStatus(value))}>{label}<span>{count ?? '·'}</span></UnstyledButton>)}
        </div>
        <Group gap="xs" wrap="nowrap" className={styles.selects}>
          <Select size="xs" aria-label="Where" value={placement} onChange={value => change(() => setPlacement(value ?? ''))} allowDeselect={false} data={[{ value: '', label: 'Everywhere' }, { value: 'in_ad', label: `In an ad${list.data ? ` (${list.data.counts.in_ad})` : ''}` }, { value: 'not_in_ad', label: `Not in an ad${list.data ? ` (${list.data.counts.not_in_ad})` : ''}` }]} />
          <Select size="xs" aria-label="Sort" value={sort} onChange={value => change(() => setSort(value ?? 'newest'))} allowDeselect={false} data={[{ value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' }, { value: 'largest', label: 'Largest first' }, { value: 'smallest', label: 'Smallest first' }]} />
        </Group>
      </div>

      <div className={styles.selectRow} data-active={selected.size > 0 || undefined}>
        <Checkbox size="sm" aria-label="Select all on this page" checked={allOnPage} indeterminate={!allOnPage && someOnPage} onChange={togglePage} disabled={!items.length} />
        {selected.size ? <>
          <Text size="sm" fw={600}>{selected.size} selected</Text>
          <Group gap={6} ml="auto" wrap="nowrap">
            {failedChosen.length > 0 && <Button size="compact-sm" variant="light" leftSection={<FiRotateCw />} onClick={() => setConfirm({ kind: 'retry', ids: failedChosen.map(item => item.id) })}>Retry {failedChosen.length}</Button>}
            <Button size="compact-sm" color="red" variant="light" leftSection={<FiTrash2 />} onClick={() => setConfirm({ kind: 'delete', ids: [...selected] })}>Delete</Button>
            <ActionIcon variant="subtle" color="gray" aria-label="Clear selection" onClick={() => setSelected(new Set())}><FiX /></ActionIcon>
          </Group>
        </> : <Text size="sm" c="dimmed">{list.data ? (list.data.total ? `${from}–${to} of ${list.data.total.toLocaleString()}` : 'No pictures') : 'Loading…'}</Text>}
      </div>

      {list.loading && !list.data ? <Stack gap={0}>{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} height={58} radius={0} mb={1} />)}</Stack>
        : list.error ? <EmptyState compact title="Pictures could not load" description="Retry to load the list." action="Retry" onAction={list.reload} />
        : items.length ? <ul className={styles.rows} data-loading={list.loading || undefined}>
          {items.map(item => {
            const state = STATUS[item.status] || { label: item.status, color: 'gray' };
            const busyRow = ['queued', 'processing'].includes(item.status);
            return <li key={item.id} className={styles.row} data-selected={selected.has(item.id) || undefined}>
              <Checkbox size="sm" aria-label={`Select picture ${item.id.slice(0, 8)}`} checked={selected.has(item.id)} onChange={() => toggle(item.id)} />
              <span className={styles.dot} data-color={state.color} aria-hidden="true" />
              <div className={styles.grow}>
                <Text size="sm" fw={600} truncate>{item.ad_id ? <>Ad #{item.ad_id}{item.title ? <span className={styles.title}> · {item.title}</span> : null}</> : <span className={styles.muted}>Not in an ad</span>}</Text>
                <Text size="xs" c="dimmed" truncate>{state.label} · {item.owner} · {ago(item.created_at)}{item.stored_bytes ? ` · ${formatBytes(item.stored_bytes)}` : ''}</Text>
              </div>
              <Menu position="bottom-end" withinPortal shadow="md" width={210}>
                <Menu.Target><ActionIcon variant="subtle" color="gray" aria-label="Picture actions"><FiMoreVertical /></ActionIcon></Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>{item.width ? `${item.width}×${item.height}` : state.label}{item.original_bytes ? ` · original ${formatBytes(item.original_bytes)}` : ''}</Menu.Label>
                  {item.ad_id && <Menu.Item leftSection={<FiCopy />} onClick={() => copy(item.ad_id!, 'Ad ID')}>Copy ad ID</Menu.Item>}
                  <Menu.Item leftSection={<FiCopy />} onClick={() => copy(item.id, 'Picture ID')}>Copy picture ID</Menu.Item>
                  {item.status === 'failed' && <Menu.Item leftSection={<FiRotateCw />} onClick={() => setConfirm({ kind: 'retry', ids: [item.id] })}>Try processing again</Menu.Item>}
                  <Menu.Divider />
                  <Menu.Item color="red" leftSection={<FiTrash2 />} disabled={busyRow} onClick={() => setConfirm({ kind: 'delete', ids: [item.id] })}>{busyRow ? 'Processing…' : 'Delete'}</Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </li>;
          })}
        </ul>
        : <EmptyState compact kind="search" title={filtered ? 'No pictures match' : 'No pictures yet'} description={filtered ? 'Try another search or filter.' : 'Pictures appear here once members add them to ads.'} action={filtered ? 'Clear filters' : undefined} onAction={() => { setQuery(''); change(() => { setStatus(''); setPlacement(''); }); }} />}

      {list.data && list.data.total > PAGE_SIZE && <Group justify="center" mt="md"><Pagination size="sm" total={Math.ceil(list.data.total / PAGE_SIZE)} value={page} onChange={value => { setPage(value); setSelected(new Set()); }} siblings={1} boundaries={1} /></Group>}
    </Paper>

    <Modal opened={Boolean(confirm)} onClose={() => setConfirm(null)} centered title={confirm?.kind === 'retry' ? 'Process again?' : `Delete ${confirm?.ids.length === 1 ? 'this picture' : `${confirm?.ids.length} pictures`}?`}>
      <Stack gap="sm">
        {confirm?.kind === 'retry'
          ? <Text size="sm">{confirm.ids.length === 1 ? 'This picture' : `${confirm.ids.length} pictures`} will be processed again. It usually takes a few seconds.</Text>
          : <><Text size="sm">{confirm?.ids.length === 1 ? 'The picture' : 'These pictures'} will be removed from storage and from any ad that shows {confirm?.ids.length === 1 ? 'it' : 'them'}.</Text><Text size="sm" fw={600} c="red.7"><FiXCircle style={{ verticalAlign: '-2px' }} /> This cannot be undone.</Text></>}
        <Group justify="flex-end" grow mt="xs"><Button variant="default" onClick={() => setConfirm(null)}>Cancel</Button><Button color={confirm?.kind === 'retry' ? undefined : 'red'} loading={busy} onClick={run}>{confirm?.kind === 'retry' ? 'Process again' : 'Delete'}</Button></Group>
      </Stack>
    </Modal>
  </Stack>;
}
