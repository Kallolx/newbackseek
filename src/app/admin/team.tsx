'use client';
import { useMemo, useState, type FormEvent } from 'react';
import { ActionIcon, Alert, Anchor, Avatar, Badge, Button, Checkbox, CopyButton, Drawer, Group, Menu, Modal, Paper, SimpleGrid, Skeleton, Stack, Text, TextInput, Title, Tooltip } from '@mantine/core';
import { FiActivity, FiCheck, FiCopy, FiEdit2, FiKey, FiMoreHorizontal, FiPause, FiPlay, FiPlus, FiRefreshCw, FiTrash2, FiUserPlus } from 'react-icons/fi';
import { adminApi, useAdminResource } from './live-api';
import { toast } from '../../components/toast';
import { EmptyState } from '../../components/page-state';
import styles from './admin.module.css';

type Permission = { key: string; label: string; default: boolean };
type Manager = {
  id: string; name: string | null; username: string; email: string; status: string; permissions: string[]; created_at: string; last_login_at: string | null;
  created_by: string | null; last_action_at: string | null; published: number; edited: number; bumped: number; distributed: number; moderated: number; reviewed: number; week: number; total: number; live_ads: number;
};
type Team = { managers: Manager[]; permissions: Permission[] };
type Activity = { events: { action: string; target_id: string; details: Record<string, unknown>; created_at: string }[]; posts: { id: string; title: string; status: string; created_at: string; cities: number }[] };
type Credentials = { name: string; email: string; password: string; title: string };

const actionLabels: Record<string, string> = {
  'ad.publish': 'Published ad', 'ad.edit': 'Edited ad', 'ad.bump': 'Bumped ad', 'ad.distribute': 'Added cities to ad', 'ad.status': 'Changed ad status', 'ad.delete': 'Deleted ad',
  'report.status': 'Handled report', 'verification.status': 'Reviewed verification', 'verification.view': 'Viewed verification photo', 'media.delete': 'Deleted picture',
  'user.status': 'Changed member status', 'user.verified': 'Changed Verified badge', 'user.delete': 'Deleted member', 'security.update': 'Changed security settings',
};

/** A strong password without look-alike characters, made in the browser. */
export function generatePassword(length = 16) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*?';
  const values = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join('');
}
const usernameFrom = (name: string) => name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24);
function when(value: string | null, empty = 'Never') {
  if (!value) return empty;
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} h ago`;
  if (minutes < 10080) return `${Math.round(minutes / 1440)} d ago`;
  return new Date(value).toLocaleDateString();
}
const portalUrl = () => typeof window === 'undefined' ? 'https://manager.backpagenew.com' : window.location.origin.replace('://admin.', '://manager.');

function PasswordBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <TextInput label="Password" value={value} onChange={(event) => onChange(event.currentTarget.value)} required minLength={10} maxLength={128} autoComplete="new-password" styles={{ input: { fontFamily: 'ui-monospace, monospace' } }}
    rightSectionWidth={72} rightSection={<Group gap={2} wrap="nowrap"><Tooltip label="Generate a new password"><ActionIcon variant="subtle" aria-label="Generate password" onClick={() => onChange(generatePassword())}><FiRefreshCw /></ActionIcon></Tooltip><CopyButton value={value}>{({ copied, copy }) => <Tooltip label={copied ? 'Copied' : 'Copy'}><ActionIcon variant="subtle" color={copied ? 'teal' : 'gray'} aria-label="Copy password" onClick={copy} disabled={!value}>{copied ? <FiCheck /> : <FiCopy />}</ActionIcon></Tooltip>}</CopyButton></Group>} />;
}

function AccessPicker({ permissions, value, onChange }: { permissions: Permission[]; value: string[]; onChange: (value: string[]) => void }) {
  return <Stack gap="xs">
    <Group justify="space-between" wrap="wrap"><Text size="sm" fw={600}>Access</Text><Group gap={4}>
      <Button size="compact-xs" variant="subtle" onClick={() => onChange(permissions.filter((item) => item.default).map((item) => item.key))}>Defaults</Button>
      <Button size="compact-xs" variant="subtle" onClick={() => onChange(permissions.map((item) => item.key))}>All</Button>
      <Button size="compact-xs" variant="subtle" color="gray" onClick={() => onChange([])}>None</Button>
    </Group></Group>
    <Checkbox.Group value={value} onChange={onChange} aria-label="Sections this manager can open">
      <SimpleGrid cols={{ base: 1, xs: 2 }} spacing={8} verticalSpacing={8}>
        {permissions.map((item) => <Checkbox key={item.key} value={item.key} label={item.label} />)}
      </SimpleGrid>
    </Checkbox.Group>
  </Stack>;
}

function CredentialsCard({ credentials, onClose }: { credentials: Credentials | null; onClose: () => void }) {
  const text = credentials ? `Manager portal: ${portalUrl()}\nEmail: ${credentials.email}\nPassword: ${credentials.password}` : '';
  return <Modal opened={Boolean(credentials)} onClose={onClose} title={credentials?.title} centered>
    {credentials && <Stack>
      <Text size="sm">Sign-in details for <b>{credentials.name}</b> (shown once):</Text>
      <Paper withBorder p="sm" radius="md" bg="gray.0"><Text component="pre" size="sm" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0, fontFamily: 'ui-monospace, monospace' }}>{text}</Text></Paper>
      <Group justify="flex-end"><CopyButton value={text}>{({ copied, copy }) => <Button leftSection={copied ? <FiCheck /> : <FiCopy />} color={copied ? 'teal' : 'indigo'} onClick={copy}>{copied ? 'Copied' : 'Copy sign-in details'}</Button>}</CopyButton><Button variant="default" onClick={onClose}>Done</Button></Group>
    </Stack>}
  </Modal>;
}

export function TeamCenter() {
  const team = useAdminResource<Team>('/admin/team');
  const permissions = useMemo(() => team.data?.permissions || [], [team.data]);
  const defaults = useMemo(() => permissions.filter((item) => item.default).map((item) => item.key), [permissions]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', username: '', password: '', permissions: [] as string[] });
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [editing, setEditing] = useState<Manager | null>(null);
  const [editAccess, setEditAccess] = useState<string[]>([]);
  const [editName, setEditName] = useState('');
  const [resetting, setResetting] = useState<Manager | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState<{ title: string; description: string; run: () => Promise<unknown>; done: string } | null>(null);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [viewing, setViewing] = useState<Manager | null>(null);
  const activity = useAdminResource<Activity>(viewing ? `/admin/team/${viewing.id}/activity` : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function openCreate() { setForm({ name: '', email: '', username: '', password: generatePassword(), permissions: defaults }); setUsernameTouched(false); setError(''); setCreating(true); }

  async function run(work: () => Promise<unknown>, done: string) {
    setBusy(true); setError('');
    try { await work(); toast.success(done); team.reload(); return true; }
    catch (cause) { const message = cause instanceof Error ? cause.message : 'The change was not saved. Please retry.'; setError(message); toast.error(message); return false; }
    finally { setBusy(false); }
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    const saved = { ...form };
    if (await run(() => adminApi('/admin/team', { method: 'POST', body: JSON.stringify({ name: saved.name.trim(), email: saved.email.trim(), username: saved.username.trim(), password: saved.password, permissions: saved.permissions }) }), `${saved.name.trim()} can now sign in to the manager portal.`)) {
      setCreating(false); setCredentials({ title: 'Manager account created', name: saved.name.trim(), email: saved.email.trim().toLowerCase(), password: saved.password });
    }
  }
  async function saveAccess(event: FormEvent) {
    event.preventDefault(); if (!editing) return;
    if (await run(() => adminApi(`/admin/team/${editing.id}`, { method: 'PATCH', body: JSON.stringify({ name: editName.trim(), permissions: editAccess }) }), 'Access updated. It applies on their next click.')) setEditing(null);
  }
  async function savePassword(event: FormEvent) {
    event.preventDefault(); if (!resetting) return;
    const target = resetting, password = newPassword;
    if (await run(() => adminApi(`/admin/team/${target.id}/password`, { method: 'POST', body: JSON.stringify({ password }) }), 'Password changed. They have been signed out.')) {
      setResetting(null); setCredentials({ title: 'New password set', name: target.name || target.username, email: target.email, password });
    }
  }

  if (team.loading && !team.data) return <Stack><SimpleGrid cols={{ base: 2, lg: 4 }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={88} radius="md" />)}</SimpleGrid><SimpleGrid cols={{ base: 1, sm: 2, xl: 3 }}>{[0, 1, 2].map((i) => <Skeleton key={i} height={210} radius="md" />)}</SimpleGrid></Stack>;
  if (team.error || !team.data) return <EmptyState title="Team could not load" description="Retry to load the manager accounts." action="Retry" onAction={team.reload} />;
  const managers = team.data.managers;
  const label = (key: string) => permissions.find((item) => item.key === key)?.label || key;
  const totals = managers.reduce((sum, item) => ({ active: sum.active + (item.status === 'active' ? 1 : 0), week: sum.week + item.week, published: sum.published + item.published }), { active: 0, week: 0, published: 0 });

  return <Stack>
    <Group justify="space-between" wrap="wrap" gap="sm">
      <Anchor href={portalUrl()} target="_blank" rel="noreferrer" size="sm">{portalUrl().replace(/^https?:\/\//, '')}</Anchor>
      <Button leftSection={<FiUserPlus />} onClick={openCreate}>Add manager</Button>
    </Group>
    <SimpleGrid cols={{ base: 2, lg: 4 }}>
      {[['Managers', managers.length], ['Active', totals.active], ['Actions · 7 days', totals.week], ['Ads published', totals.published]].map(([name, value]) => <Paper key={String(name)} withBorder p="md" radius="md"><Text size="sm" c="dimmed">{name}</Text><Title order={2}>{value}</Title></Paper>)}
    </SimpleGrid>
    {!managers.length ? <Paper withBorder radius="md"><EmptyState title="No managers yet" description="" action="Add manager" onAction={openCreate} /></Paper> :
      <SimpleGrid cols={{ base: 1, sm: 2, xl: 3 }} spacing="md">{managers.map((manager) => <Paper key={manager.id} withBorder radius="md" p="md" className={styles.managerCard}>
        <Group wrap="nowrap" align="flex-start" gap="sm">
          <Avatar radius="xl" color="grape" size={44}>{(manager.name || manager.username).slice(0, 2).toUpperCase()}</Avatar>
          <div style={{ minWidth: 0, flex: 1 }}>
            <Group gap={6} wrap="nowrap"><Text fw={700} truncate>{manager.name || manager.username}</Text><Badge size="sm" variant="light" color={manager.status === 'active' ? 'teal' : 'orange'} radius="sm" styles={{ label: { overflow: 'visible' } }} style={{ textTransform: 'capitalize', flexShrink: 0 }}>{manager.status}</Badge></Group>
            <Text size="xs" c="dimmed" truncate>@{manager.username} · {manager.email}</Text>
          </div>
          <Menu withinPortal position="bottom-end" width={220}><Menu.Target><ActionIcon aria-label={`Actions for ${manager.username}`} variant="subtle" color="gray" size="lg"><FiMoreHorizontal size={20} /></ActionIcon></Menu.Target><Menu.Dropdown>
              <Menu.Item leftSection={<FiActivity />} onClick={() => setViewing(manager)}>Posts and activity</Menu.Item>
              <Menu.Item leftSection={<FiEdit2 />} onClick={() => { setEditing(manager); setEditAccess(manager.permissions); setEditName(manager.name || manager.username); setError(''); }}>Edit name and access</Menu.Item>
              <Menu.Item leftSection={<FiKey />} onClick={() => { setResetting(manager); setNewPassword(generatePassword()); setError(''); }}>Set a new password</Menu.Item>
              <Menu.Item color={manager.status === 'active' ? 'orange' : 'teal'} leftSection={manager.status === 'active' ? <FiPause /> : <FiPlay />} onClick={() => setConfirm(manager.status === 'active'
                ? { title: `Suspend ${manager.name || manager.username}?`, description: 'They are signed out at once and cannot sign in until you restore them. Their ads stay live.', run: () => adminApi(`/admin/team/${manager.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'suspended' }) }), done: 'Manager suspended.' }
                : { title: `Restore ${manager.name || manager.username}?`, description: 'They can sign in again with their current password.', run: () => adminApi(`/admin/team/${manager.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'active' }) }), done: 'Manager restored.' })}>{manager.status === 'active' ? 'Suspend' : 'Restore'}</Menu.Item>
              <Menu.Divider />
              <Menu.Item color="red" leftSection={<FiTrash2 />} onClick={() => setConfirm({ title: `Remove ${manager.name || manager.username}?`, description: 'Their login is removed and they are signed out. Ads they published stay live, and their history stays in the records.', run: () => adminApi(`/admin/team/${manager.id}`, { method: 'DELETE' }), done: 'Manager removed.' })}>Remove manager</Menu.Item>
            </Menu.Dropdown></Menu>
        </Group>
        <SimpleGrid cols={4} spacing={6} mt="md">
          {[['Published', manager.published], ['Bumped', manager.bumped], ['Cities', manager.distributed], ['Reviews', manager.reviewed + manager.moderated]].map(([name, value]) => <div key={String(name)} className={styles.miniStat}><strong>{value}</strong><span>{name}</span></div>)}
        </SimpleGrid>
        <Group justify="space-between" mt="md" gap="xs" wrap="wrap">
          <Tooltip multiline w={240} label={manager.permissions.length ? manager.permissions.map(label).join(', ') : 'No sections'}><Badge variant="outline" color="indigo" radius="sm" tt="none" styles={{ label: { overflow: 'visible' } }}>{manager.permissions.length}/{permissions.length} sections</Badge></Tooltip>
          <Text size="xs" c="dimmed">{manager.last_action_at ? 'Active ' + when(manager.last_action_at) : manager.last_login_at ? 'Signed in ' + when(manager.last_login_at) : 'Never signed in'}</Text>
        </Group>
        <Button variant="light" size="compact-sm" mt="sm" fullWidth leftSection={<FiActivity />} onClick={() => setViewing(manager)}>Posts and activity</Button>
      </Paper>)}</SimpleGrid>}

    <Modal opened={creating} onClose={() => { if (!busy) setCreating(false); }} title="Add manager" centered size="lg">
      <form onSubmit={create}><Stack>
        <SimpleGrid cols={{ base: 1, xs: 2 }}>
          <TextInput label="Full name" value={form.name} required minLength={2} maxLength={80} autoComplete="off" onChange={(event) => { const name = event.currentTarget.value; setForm((value) => ({ ...value, name, username: usernameTouched ? value.username : usernameFrom(name) })); }} />
          <TextInput label="Email" type="email" value={form.email} required maxLength={254} autoComplete="off" onChange={(event) => { const email = event.currentTarget.value; setForm((value) => ({ ...value, email })); }} />
          <TextInput label="Username" value={form.username} required pattern="[a-z0-9_]{3,30}" maxLength={30} autoComplete="off" onChange={(event) => { const username = event.currentTarget.value.toLowerCase(); setUsernameTouched(true); setForm((value) => ({ ...value, username })); }} />
          <PasswordBox value={form.password} onChange={(password) => setForm((value) => ({ ...value, password }))} />
        </SimpleGrid>
        <AccessPicker permissions={permissions} value={form.permissions} onChange={(list) => setForm((value) => ({ ...value, permissions: list }))} />
        {error && <Alert color="red" variant="light">{error}</Alert>}
        <Group justify="flex-end"><Button variant="default" disabled={busy} onClick={() => setCreating(false)}>Cancel</Button><Button type="submit" loading={busy} leftSection={<FiPlus />}>Create manager</Button></Group>
      </Stack></form>
    </Modal>

    <Modal opened={Boolean(editing)} onClose={() => { if (!busy) setEditing(null); }} title={`Edit ${editing?.name || editing?.username || ''}`} centered size="lg">
      <form onSubmit={saveAccess}><Stack>
        <TextInput label="Full name" value={editName} required minLength={2} maxLength={80} onChange={(event) => setEditName(event.currentTarget.value)} />
        <AccessPicker permissions={permissions} value={editAccess} onChange={setEditAccess} />
        {error && <Alert color="red" variant="light">{error}</Alert>}
        <Group justify="flex-end"><Button variant="default" disabled={busy} onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" loading={busy}>Save changes</Button></Group>
      </Stack></form>
    </Modal>

    <Modal opened={Boolean(resetting)} onClose={() => { if (!busy) setResetting(null); }} title={`New password for ${resetting?.name || resetting?.username || ''}`} centered>
      <form onSubmit={savePassword}><Stack>
        <PasswordBox value={newPassword} onChange={setNewPassword} />
        {error && <Alert color="red" variant="light">{error}</Alert>}
        <Group justify="flex-end"><Button variant="default" disabled={busy} onClick={() => setResetting(null)}>Cancel</Button><Button type="submit" loading={busy}>Set password</Button></Group>
      </Stack></form>
    </Modal>

    <Modal opened={Boolean(confirm)} onClose={() => { if (!busy) setConfirm(null); }} title={confirm?.title} centered>
      <Stack><Text size="sm">{confirm?.description}</Text><Group justify="flex-end"><Button variant="default" disabled={busy} onClick={() => setConfirm(null)}>Cancel</Button><Button color={/remove|suspend/i.test(confirm?.title || '') ? 'red' : 'indigo'} loading={busy} onClick={async () => { if (confirm && await run(confirm.run, confirm.done)) setConfirm(null); }}>Confirm</Button></Group></Stack>
    </Modal>

    <CredentialsCard credentials={credentials} onClose={() => setCredentials(null)} />

    <Drawer opened={Boolean(viewing)} onClose={() => setViewing(null)} position="right" size="lg" title={viewing ? `${viewing.name || viewing.username} · posts and activity` : ''}>
      {activity.loading ? <Stack>{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={46} radius="md" />)}</Stack> : !activity.data ? <EmptyState title="Activity could not load" description="Retry in a moment." action="Retry" onAction={activity.reload} /> : <Stack>
        <Title order={4} size="h5">Ads ({activity.data.posts.length})</Title>
        {!activity.data.posts.length ? <Text size="sm" c="dimmed">No ads published yet.</Text> : <Stack gap={6}>{activity.data.posts.map((post) => <Paper key={post.id} withBorder p="xs" radius="md"><Group justify="space-between" wrap="nowrap" gap="xs"><div style={{ minWidth: 0 }}><Text size="sm" fw={600} truncate>#{post.id} · {post.title}</Text><Text size="xs" c="dimmed">{new Date(post.created_at).toLocaleString()} · {post.cities} {post.cities === 1 ? 'city' : 'cities'}</Text></div><Badge variant="light" radius="sm" color={post.status === 'published' ? 'teal' : 'gray'} style={{ textTransform: 'capitalize', flexShrink: 0 }}>{post.status}</Badge></Group></Paper>)}</Stack>}
        <Title order={4} size="h5" mt="sm">Recent actions</Title>
        {!activity.data.events.length ? <Text size="sm" c="dimmed">No actions yet.</Text> : <Stack gap={4}>{activity.data.events.map((event, index) => <Group key={index} justify="space-between" wrap="nowrap" gap="xs" py={4} style={{ borderBottom: '1px solid var(--mantine-color-gray-2)' }}><Text size="sm">{actionLabels[event.action] || event.action}{/^\d+$/.test(event.target_id) ? ` #${event.target_id}` : ''}</Text><Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>{when(event.created_at)}</Text></Group>)}</Stack>}
      </Stack>}
    </Drawer>
  </Stack>;
}
