'use client';
import { useEffect, useMemo, useState } from 'react';
import { useMediaQuery } from '@mantine/hooks';
import { ActionIcon, Alert, Anchor, Badge, Button, Chip, Group, Loader, Menu, Modal, Paper, Progress, Select, SimpleGrid, Skeleton, Stack, Text, TextInput, Title, UnstyledButton } from '@mantine/core';
import { FiAlertTriangle, FiCalendar, FiCheckCircle, FiClock, FiCopy, FiEdit2, FiExternalLink, FiImage, FiMapPin, FiMoreHorizontal, FiPlus, FiRefreshCw, FiSend, FiTrash2, FiX, FiZap } from 'react-icons/fi';
import { adminApi, useAdminResource } from './live-api';
import { Publisher, type PublishRequest } from './publisher';
import type { Ad, CategoryGroup, LocationCountry } from './admin-data';
import { toast } from '../../components/toast';
import { EmptyState } from '../../components/page-state';
import styles from './admin.module.css';

type Status = 'draft' | 'scheduled' | 'queued' | 'publishing' | 'failed';
type Post = { title: string; description: string; categorySlug: string; owner: string; cityHrefs: string[]; age?: number; location: string; phone: string; contactEmail: string };
type Card = { id: string; status: Status; publishAt: string | null; error: string | null; post: Post; pictures: { id: string; status: string; url: string }[]; createdAt: string; updatedAt: string };
type Recent = { id: string; ad_id: number; published_at: string; title: string; category: string; city: string | null };
type Board = { posts: Card[]; recent: Recent[]; limit: number; now: string };

const SITE = 'https://backpagenew.com';
const statusLook: Record<Status, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'gray' }, scheduled: { label: 'Scheduled', color: 'indigo' }, queued: { label: 'In queue', color: 'orange' },
  publishing: { label: 'Publishing', color: 'blue' }, failed: { label: 'Needs attention', color: 'red' },
};
const pad = (value: number) => String(value).padStart(2, '0');
/** Value for <input type="datetime-local"> in the admin's own time zone. */
const localInput = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
function at(now: number, hours: number, minutes = 0, dayOffset = 0) { const date = new Date(now); date.setDate(date.getDate() + dayOffset); date.setHours(hours, minutes, 0, 0); return date; }
function nextHour() { const date = new Date(); date.setMinutes(0, 0, 0); date.setHours(date.getHours() + 1); return date; }
function friendly(value: string, nowMs: number) {
  const date = new Date(value), now = new Date(nowMs);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const tomorrow = new Date(nowMs); tomorrow.setDate(now.getDate() + 1);
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const day = sameDay(date, now) ? 'Today' : sameDay(date, tomorrow) ? 'Tomorrow' : date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const minutes = Math.round((date.getTime() - now.getTime()) / 60000);
  const away = minutes <= 0 ? 'any moment' : minutes < 60 ? `in ${minutes} min` : minutes < 1440 ? `in ${Math.round(minutes / 60)} h` : `in ${Math.round(minutes / 1440)} d`;
  return `${day}, ${time} · ${away}`;
}
const asAd = (card: Card): Ad => ({ id: 0, title: card.post.title, description: card.post.description, category: card.post.categorySlug, owner: card.post.owner, targets: card.post.cityHrefs, age: card.post.age, location: card.post.location, phone: card.post.phone, email: card.post.contactEmail, images: card.pictures.map((picture) => picture.url).filter(Boolean), status: 'Draft', updated: card.updatedAt });

/** Date/time picker with one-tap suggestions; works with the phone's own picker. */
function TimePicker({ value, onChange, now }: { value: string; onChange: (value: string) => void; now: number }) {
  const hour = new Date(now + 3600000); hour.setSeconds(0, 0);
  const suggestions: [string, Date][] = [['In 1 hour', hour], ['Tonight 9 PM', at(now, 21)], ['Tomorrow 9 AM', at(now, 9, 0, 1)], ['Tomorrow 6 PM', at(now, 18, 0, 1)]];
  return <Stack gap="xs">
    <Group gap={6}>{suggestions.filter(([, date]) => date.getTime() > now + 60000).map(([label, date]) => <Chip key={label} size="sm" checked={value === localInput(date)} onChange={() => onChange(localInput(date))}>{label}</Chip>)}</Group>
    <TextInput type="datetime-local" label="Date and time" value={value} min={localInput(new Date(now + 120000))} onChange={(event) => onChange(event.currentTarget.value)} required />
    <Text size="xs" c="dimmed">Your time zone: {Intl.DateTimeFormat().resolvedOptions().timeZone}</Text>
  </Stack>;
}

export function PostPlanner({ locations, categories, defaultOwner }: { locations: LocationCountry[]; categories: CategoryGroup[]; defaultOwner?: string }) {
  const board = useAdminResource<Board>('/admin/planner');
  const phone = useMediaQuery('(max-width: 48em)');
  const [editing, setEditing] = useState<Card | 'new' | null>(null);
  const [timing, setTiming] = useState<Card | null>(null);
  const [time, setTime] = useState('');
  const [spread, setSpread] = useState(false);
  const [spreadStart, setSpreadStart] = useState('');
  const [gap, setGap] = useState<string | null>('30');
  const [confirm, setConfirm] = useState<{ title: string; text: string; run: () => Promise<unknown>; done: string } | null>(null);
  const [busy, setBusy] = useState('');
  // The batch being published right now (ids), so the progress bar can count what is done.
  const [chosen, setBatch] = useState<string[] | null>(null);
  const [showRecent, setShowRecent] = useState(false);
  const reload = board.reload;
  // A clock for "in 3 h" labels; it ticks with the refreshes.
  const [now, setNow] = useState(() => Date.now());

  const cards = useMemo(() => board.data?.posts ?? [], [board.data]);
  const active = cards.filter((card) => card.status === 'queued' || card.status === 'publishing');
  const drafts = cards.filter((card) => card.status === 'draft' || card.status === 'failed');
  const scheduled = cards.filter((card) => card.status === 'scheduled');
  const soonest = scheduled.reduce((min, card) => Math.min(min, new Date(card.publishAt!).getTime()), Infinity);
  // Refresh often while something is publishing (or due very soon), otherwise every half minute.
  const fast = active.length > 0 || soonest - now < 120000;
  useEffect(() => { const timer = setInterval(() => { setNow(Date.now()); reload(); }, fast ? 3000 : 30000); return () => clearInterval(timer); }, [reload, fast]);
  const batch = chosen ?? active.map((card) => card.id);

  const batchCards = batch.map((id) => cards.find((card) => card.id === id));
  const batchDone = batchCards.filter((card) => !card).length;
  const batchFailed = batchCards.filter((card) => card?.status === 'failed').length;
  const batchLeft = batch.length - batchDone - batchFailed;
  useEffect(() => { if (chosen?.length && batchLeft === 0) { const timer = setTimeout(() => setBatch(null), 8000); return () => clearTimeout(timer); } }, [chosen, batchLeft]);

  async function run(name: string, work: () => Promise<unknown>, done?: string) {
    setBusy(name);
    try { await work(); if (done) toast.success(done); reload(); return true; }
    catch (error) { toast.error(error instanceof Error ? error.message : 'That did not work. Please try again.'); return false; }
    finally { setBusy(''); }
  }
  const publishNow = (card: Card) => run('publish-' + card.id, async () => { await adminApi(`/admin/planner/${card.id}/publish`, { method: 'POST' }); setBatch((ids) => [...new Set([...(ids ?? active.map((item) => item.id)).filter((id) => cards.some((item) => item.id === id && item.status !== 'failed')), card.id])]); }, 'Added to the publishing queue.');
  const publishAll = () => run('all', async () => { const ids = drafts.map((card) => card.id); const result = await adminApi<{ queued: number }>('/admin/planner/publish-all', { method: 'POST' }); setBatch((current) => [...new Set([...(current ?? active.map((item) => item.id)), ...ids])]); toast.success(`${result.queued} post${result.queued === 1 ? '' : 's'} added to the publishing queue.`); });
  const setSchedule = (card: Card, value: string | null) => run('time-' + card.id, () => adminApi(`/admin/planner/${card.id}/schedule`, { method: 'POST', body: JSON.stringify({ publishAt: value ? new Date(value).toISOString() : null }) }), value ? 'Scheduled.' : 'Schedule removed.');
  const spreadAll = () => run('spread', async () => {
    const start = new Date(spreadStart).getTime(), step = Number(gap) * 60000;
    for (const [index, card] of drafts.entries()) await adminApi(`/admin/planner/${card.id}/schedule`, { method: 'POST', body: JSON.stringify({ publishAt: new Date(start + index * step).toISOString() }) });
    setSpread(false);
  }, `${drafts.length} posts scheduled.`);

  async function save(request: PublishRequest) {
    const card = editing && editing !== 'new' ? editing : null;
    const kept = card ? card.pictures.filter((picture) => request.images?.includes(picture.url)).map((picture) => picture.id) : [];
    const post = { title: request.titles[0], description: request.description, categorySlug: request.category, owner: request.owner, cityHrefs: request.targets, age: request.age, location: request.location ?? '', phone: request.phone ?? '', contactEmail: request.email ?? '', mediaIds: [...kept, ...(request.mediaIds ?? [])] };
    await adminApi(card ? `/admin/planner/${card.id}` : '/admin/planner', { method: card ? 'PATCH' : 'POST', body: JSON.stringify({ post }) });
    toast.success(card ? 'Post updated.' : 'Post added to the planner.');
    setEditing(null); reload();
  }

  if (!board.data && board.loading) return <Stack><Skeleton height={72} radius="md" /><SimpleGrid cols={{ base: 1, sm: 2, xl: 3 }}>{[0, 1, 2].map((i) => <Skeleton key={i} height={330} radius="md" />)}</SimpleGrid></Stack>;
  if (!board.data) return <EmptyState title="The planner could not load" description="" action="Retry" onAction={reload} />;
  const { limit, recent } = board.data;
  const full = cards.length >= limit;
  const categoryName = (slug: string) => categories.flatMap((group) => group.services).find((service) => service.slug === slug)?.name ?? slug;

  return <Stack>
    {/* Summary and the big actions */}
    <Paper withBorder radius="md" p="md">
      <Group justify="space-between" gap="sm" wrap="wrap">
        <Group gap={6} wrap="wrap">
          <Badge size="lg" variant="light" color="gray">{drafts.length} draft{drafts.length === 1 ? '' : 's'}</Badge>
          <Badge size="lg" variant="light" color="indigo">{scheduled.length} scheduled</Badge>
          {active.length > 0 && <Badge size="lg" variant="light" color="orange">{active.length} publishing</Badge>}
          <Text size="xs" c="dimmed">{cards.length} / {limit}</Text>
        </Group>
        <Group gap="xs" wrap="wrap" className={styles.plannerActions}>
          {drafts.length > 1 && <Button variant="default" leftSection={<FiCalendar />} onClick={() => { setSpreadStart(localInput(nextHour())); setSpread(true); }}>Schedule all</Button>}
          {drafts.length > 0 && <Button color="teal" leftSection={<FiSend />} loading={busy === 'all'} onClick={() => setConfirm({ title: `Publish ${drafts.length} post${drafts.length === 1 ? '' : 's'} now?`, text: 'They go live one after another. You can keep working while they publish.', run: publishAll, done: '' })}>Publish all ({drafts.length})</Button>}
          <Button leftSection={<FiPlus />} disabled={full} onClick={() => setEditing('new')}>Add post</Button>
        </Group>
      </Group>
    </Paper>

    {/* Progress of the current batch */}
    {batch.length > 0 && <Paper withBorder radius="md" p="md" className={styles.plannerProgress}>
      <Group justify="space-between" mb={8} wrap="nowrap">
        <Group gap={8} wrap="nowrap">{batchLeft > 0 ? <Loader size="sm" /> : batchFailed ? <FiAlertTriangle color="var(--mantine-color-red-6)" /> : <FiCheckCircle color="var(--mantine-color-teal-6)" />}
          <Text fw={600} size="sm">{batchLeft > 0 ? `Publishing ${batchDone + batchFailed + 1} of ${batch.length}` : batchFailed ? `${batchDone} published · ${batchFailed} need attention` : `All ${batch.length} published`}</Text></Group>
        <Text size="sm" c="dimmed">{batchDone}/{batch.length}</Text>
      </Group>
      <Progress.Root size="lg" radius="xl">
        <Progress.Section value={(batchDone / batch.length) * 100} color="teal" />
        <Progress.Section value={(batchFailed / batch.length) * 100} color="red" />
        <Progress.Section value={(batchLeft / batch.length) * 100} color="gray.3" className={batchLeft ? styles.progressWaiting : undefined} />
      </Progress.Root>
    </Paper>}

    {/* Cards */}
    {!cards.length ? <Paper withBorder radius="md"><EmptyState title="No posts planned" description="" action="Add post" onAction={() => setEditing('new')} /></Paper> :
    <SimpleGrid cols={{ base: 1, sm: 2, xl: 3 }} spacing="md">
      {cards.map((card) => {
        const look = statusLook[card.status], locked = card.status === 'queued' || card.status === 'publishing';
        const cover = card.pictures[0]?.url;
        return <Paper key={card.id} withBorder radius="md" className={styles.planCard} data-status={card.status}>
          <div className={styles.planCover}>
            {cover ? <img src={cover} alt="" loading="lazy" /> : <span><FiImage /></span>}
            <Badge className={styles.planStatus} color={look.color} variant="filled" radius="sm" leftSection={locked ? <Loader size={10} color="white" /> : undefined}>{look.label}</Badge>
            {card.pictures.length > 1 && <span className={styles.planCount}>{card.pictures.length} pictures</span>}
          </div>
          <Stack gap={6} p="md" style={{ flex: 1 }}>
            <Text fw={700} lineClamp={2}>{card.post.title}</Text>
            <Text size="xs" c="dimmed" lineClamp={1}>{categoryName(card.post.categorySlug)} · @{card.post.owner}</Text>
            <Group gap={6} wrap="nowrap"><FiMapPin size={13} /><Text size="xs" c="dimmed">{card.post.cityHrefs.length} {card.post.cityHrefs.length === 1 ? 'city' : 'cities'}</Text></Group>
            <div className={styles.planWhen} data-status={card.status}>
              {card.status === 'scheduled' && card.publishAt ? <><FiClock /> {friendly(card.publishAt, now)}</> :
               card.status === 'queued' ? <><FiClock /> Waiting its turn…</> :
               card.status === 'publishing' ? <><FiZap /> Publishing now…</> :
               card.status === 'failed' ? <><FiAlertTriangle /> {card.error || 'Could not publish.'}</> :
               <><FiCalendar /> Not scheduled</>}
            </div>
            <Group gap="xs" mt="auto" pt={6} wrap="nowrap">
              {!locked && <Button size="sm" style={{ flex: 1 }} color={card.status === 'failed' ? 'red' : 'teal'} leftSection={card.status === 'failed' ? <FiRefreshCw /> : <FiSend />} loading={busy === 'publish-' + card.id} onClick={() => void publishNow(card)}>{card.status === 'failed' ? 'Try again' : 'Publish now'}</Button>}
              {!locked && <Button size="sm" variant="default" leftSection={<FiCalendar />} onClick={() => { setTime(card.publishAt ? localInput(new Date(card.publishAt)) : localInput(nextHour())); setTiming(card); }}>{card.status === 'scheduled' ? 'Change' : 'Schedule'}</Button>}
              {locked && <Text size="xs" c="dimmed" style={{ flex: 1 }}>This post will appear on the site shortly.</Text>}
              <Menu withinPortal position="bottom-end" width={200}>
                <Menu.Target><ActionIcon variant="subtle" color="gray" size="lg" aria-label={'More actions for ' + card.post.title}><FiMoreHorizontal size={20} /></ActionIcon></Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item leftSection={<FiEdit2 />} disabled={locked} onClick={() => setEditing(card)}>Edit</Menu.Item>
                  {card.status === 'scheduled' && <Menu.Item leftSection={<FiX />} onClick={() => void setSchedule(card, null)}>Remove schedule</Menu.Item>}
                  <Menu.Item leftSection={<FiCopy />} disabled={full} onClick={() => void run('copy', () => adminApi(`/admin/planner/${card.id}/duplicate`, { method: 'POST' }), 'Copy added (without pictures).')}>Duplicate</Menu.Item>
                  <Menu.Divider />
                  <Menu.Item color="red" leftSection={<FiTrash2 />} disabled={card.status === 'publishing'} onClick={() => setConfirm({ title: 'Delete this post?', text: `“${card.post.title}” is removed from the planner. Nothing was published yet.`, run: () => adminApi(`/admin/planner/${card.id}`, { method: 'DELETE' }), done: 'Post deleted.' })}>Delete</Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Group>
          </Stack>
        </Paper>;
      })}
      {!full && <UnstyledButton className={styles.planAdd} onClick={() => setEditing('new')}><FiPlus size={28} /><Text fw={600}>Add post</Text></UnstyledButton>}
    </SimpleGrid>}

    {recent.length > 0 && <Paper withBorder radius="md" p="md">
      <Group justify="space-between"><Title order={3} size="h5">Published · last 3 days ({recent.length})</Title><Button variant="subtle" size="compact-sm" onClick={() => setShowRecent((value) => !value)}>{showRecent ? 'Hide' : 'Show'}</Button></Group>
      {showRecent && <Stack gap={0} mt="sm">{recent.map((item) => <Group key={item.id} justify="space-between" wrap="nowrap" py={8} className={styles.planRecent}>
        <div style={{ minWidth: 0 }}><Text size="sm" fw={600} truncate>#{item.ad_id} · {item.title}</Text><Text size="xs" c="dimmed">{new Date(item.published_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</Text></div>
        {item.city && <Anchor href={`${SITE}${item.city}/${item.category}/${item.ad_id}`} target="_blank" rel="noreferrer" size="sm" style={{ flexShrink: 0 }}><Group gap={4} wrap="nowrap">View <FiExternalLink size={13} /></Group></Anchor>}
      </Group>)}</Stack>}
    </Paper>}

    {/* Add / edit: the same form as a regular ad */}
    <Modal opened={Boolean(editing)} onClose={() => setEditing(null)} fullScreen={phone} size="xl" title={editing === 'new' ? 'New post' : 'Edit post'} closeOnClickOutside={false}>
      {editing && <Publisher key={editing === 'new' ? 'new' : editing.id} locations={locations} categories={categories} source={editing === 'new' ? undefined : asAd(editing)} mode={editing === 'new' ? 'create' : 'edit'} onSubmit={save} defaultOwner={defaultOwner} heading={editing === 'new' ? 'Post details' : 'Post details'} submitLabel={editing === 'new' ? 'Add to planner' : 'Save post'} removableSaved />}
    </Modal>

    <Modal opened={Boolean(timing)} onClose={() => setTiming(null)} title="When should it go live?" centered fullScreen={phone}>
      {timing && <Stack>
        <Text size="sm" lineClamp={2} fw={600}>{timing.post.title}</Text>
        <TimePicker value={time} onChange={setTime} now={now} />
        <Group justify="flex-end" mt="sm">
          {timing.status === 'scheduled' && <Button variant="subtle" color="red" onClick={async () => { if (await setSchedule(timing, null)) setTiming(null); }}>Remove schedule</Button>}
          <Button variant="default" onClick={() => setTiming(null)}>Cancel</Button>
          <Button leftSection={<FiCalendar />} disabled={!time} loading={busy === 'time-' + timing.id} onClick={async () => { if (await setSchedule(timing, time)) setTiming(null); }}>Schedule</Button>
        </Group>
      </Stack>}
    </Modal>

    <Modal opened={spread} onClose={() => setSpread(false)} title={`Schedule all ${drafts.length} drafts`} centered fullScreen={phone}>
      <Stack>
        <TextInput type="datetime-local" label="First post goes live" value={spreadStart} min={localInput(new Date(now + 120000))} onChange={(event) => setSpreadStart(event.currentTarget.value)} />
        <Select label="Then one more every" value={gap} onChange={setGap} allowDeselect={false} data={[['0', 'All at the same time'], ['15', '15 minutes'], ['30', '30 minutes'], ['60', '1 hour'], ['120', '2 hours'], ['240', '4 hours'], ['1440', 'Day']].map(([value, label]) => ({ value, label }))} />
        {spreadStart && gap && <Alert variant="light" color="indigo" icon={<FiClock />}>Last one: {friendly(new Date(new Date(spreadStart).getTime() + (drafts.length - 1) * Number(gap) * 60000).toISOString(), now)}</Alert>}
        <Group justify="flex-end"><Button variant="default" onClick={() => setSpread(false)}>Cancel</Button><Button disabled={!spreadStart} loading={busy === 'spread'} onClick={() => void spreadAll()}>Schedule {drafts.length} posts</Button></Group>
      </Stack>
    </Modal>

    <Modal opened={Boolean(confirm)} onClose={() => { if (!busy) setConfirm(null); }} title={confirm?.title} centered>
      <Stack><Text size="sm">{confirm?.text}</Text><Group justify="flex-end"><Button variant="default" onClick={() => setConfirm(null)}>Cancel</Button>
        <Button color={/delete/i.test(confirm?.title || '') ? 'red' : 'teal'} loading={Boolean(busy)} onClick={async () => { if (confirm && await run('confirm', confirm.run, confirm.done || undefined)) setConfirm(null); }}>Confirm</Button></Group></Stack>
    </Modal>
  </Stack>;
}
