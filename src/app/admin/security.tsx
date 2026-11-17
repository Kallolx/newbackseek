'use client';
import { useMemo, useState, type ReactNode } from 'react';
import { ActionIcon, Alert, Badge, Button, Group, Modal, MultiSelect, Paper, Skeleton, Stack, Switch, TagsInput, Text, Title } from '@mantine/core';
import { FiAlertTriangle, FiCloud, FiGlobe, FiLock, FiRefreshCw, FiServer, FiShield, FiUserCheck } from 'react-icons/fi';
import { adminApi, useAdminResource } from './live-api';
import { toast } from '../../components/toast';
import { EmptyState } from '../../components/page-state';
import styles from './security.module.css';

type Settings = { geoEnabled: boolean; blockedCountries: string[]; blockTor: boolean; blockUnknown: boolean; protectAdmin: boolean; cloudflareOnly: boolean; adminAllowlistOnly: boolean; allowlist: string[]; edge: { configured: boolean; status: string; message: string; syncedAt: string | null }; updatedAt: string };
type Security = { settings: Settings; you: { ip: string; country: string; allowlisted: boolean }; hosts: { site: string; admin: string; media: string }; stats: { day: string; reason: string; count: number }[] };
type Editable = Omit<Settings, 'edge' | 'updatedAt'>;

const CODES = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW'.split(' ');
const regionNames = typeof Intl !== 'undefined' && 'DisplayNames' in Intl ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;
const countryName = (code: string) => code === 'T1' ? 'Tor network' : code === 'XX' ? 'Unknown location' : code === 'direct' ? 'Bypassed Cloudflare' : code === 'admin' ? 'Admin panel (not allowlisted)' : (() => { try { return regionNames?.of(code) || code; } catch { return code; } })();
const editable = (settings: Settings): Editable => ({ geoEnabled: settings.geoEnabled, blockedCountries: settings.blockedCountries, blockTor: settings.blockTor, blockUnknown: settings.blockUnknown, protectAdmin: settings.protectAdmin, cloudflareOnly: settings.cloudflareOnly, adminAllowlistOnly: settings.adminAllowlistOnly, allowlist: settings.allowlist });

function StatusRow({ icon, label, badge, detail }: { icon: ReactNode; label: string; badge: ReactNode; detail?: string }) {
  return <div className={styles.statusRow}><span className={styles.statusIcon}>{icon}</span><div className={styles.statusText}><Text size="sm" fw={600}>{label}</Text>{detail && <Text size="xs" c="dimmed" lineClamp={2}>{detail}</Text>}</div>{badge}</div>;
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return <Paper withBorder radius="md" className={styles.section}><Group gap={8} mb="sm" wrap="nowrap"><span className={styles.sectionIcon}>{icon}</span><Title order={3} size="h5">{title}</Title></Group>{children}</Paper>;
}

export function SecurityCenter() {
  const { data, loading, error, reload } = useAdminResource<Security>('/admin/security');
  // null = no unsaved edits; the form then mirrors the saved settings.
  const [draft, setDraft] = useState<Editable | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const options = useMemo(() => CODES.map(code => ({ value: code, label: `${countryName(code)} (${code})` })).sort((a, b) => a.label.localeCompare(b.label)), []);
  const totals = useMemo(() => {
    const byReason = new Map<string, number>();
    for (const row of data?.stats || []) byReason.set(row.reason, (byReason.get(row.reason) || 0) + row.count);
    return [...byReason.entries()].sort((a, b) => b[1] - a[1]);
  }, [data]);

  if (!data && loading) return <Stack>{[0, 1, 2].map(i => <Skeleton key={i} height={120} radius="md" />)}</Stack>;
  const form = draft ?? (data ? editable(data.settings) : null);
  if (error || !data || !form) return <EmptyState title="Security settings could not load" description="Retry to load the current protection settings." action="Retry" onAction={reload} />;

  const set = <K extends keyof Editable>(key: K, value: Editable[K]) => setDraft({ ...form, [key]: value });
  const dirty = JSON.stringify(form) !== JSON.stringify(editable(data.settings));
  const youAllowed = data.you.allowlisted || form.allowlist.includes(data.you.ip);
  const youBlockedOnSite = form.geoEnabled && !youAllowed && (form.blockedCountries.includes(data.you.country) || (form.blockTor && data.you.country === 'T1'));
  const adminRisk = !youAllowed && ((form.protectAdmin && youBlockedOnSite) || form.adminAllowlistOnly);
  const edge = data.settings.edge;
  const edgeBadge = !edge.configured ? <Badge color="gray" variant="light">Not connected</Badge> : edge.status === 'active' ? <Badge color="teal" variant="light">Active</Badge> : edge.status === 'off' ? <Badge color="gray" variant="light">Idle</Badge> : edge.status === 'error' ? <Badge color="red" variant="light">Error</Badge> : <Badge color="yellow" variant="light">Pending</Badge>;

  async function save() {
    setSaving(true);
    try { await adminApi('/admin/security', { method: 'PUT', body: JSON.stringify(form) }); toast.success('Protection settings saved.'); setConfirming(false); setDraft(null); reload(); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : 'Could not save the settings.'); }
    finally { setSaving(false); }
  }
  async function sync() {
    setSaving(true);
    try { const result = await adminApi<{ settings: Settings }>('/admin/security/sync', { method: 'POST' }); if (result.settings.edge.status === 'error') toast.error(result.settings.edge.message); else toast.success('Cloudflare rule is up to date.'); reload(); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : 'Sync failed.'); }
    finally { setSaving(false); }
  }

  return <Stack gap="md" className={styles.page}>
    <Group justify="space-between" wrap="nowrap" gap="xs">
      <Text size="sm" c="dimmed">Decide who can reach the site. Changes apply within seconds.</Text>
      <ActionIcon variant="default" size="lg" aria-label="Refresh" onClick={reload}><FiRefreshCw /></ActionIcon>
    </Group>

    <Paper withBorder radius="md" className={styles.status}>
      <StatusRow icon={<FiUserCheck />} label="Your connection" detail={`${data.you.ip || 'Unknown IP'} · ${data.you.country ? countryName(data.you.country) : 'Unknown country'}`} badge={youAllowed ? <Badge color="teal" variant="light">Allowlisted</Badge> : <Badge color="gray" variant="light">Direct</Badge>} />
      <StatusRow icon={<FiServer />} label="Server gate" detail="Checks every request on the server." badge={<Badge color={data.settings.geoEnabled ? 'teal' : 'gray'} variant="light">{data.settings.geoEnabled ? 'Blocking' : 'Off'}</Badge>} />
      <StatusRow icon={<FiCloud />} label="Cloudflare edge rule" detail={edge.message || 'Blocks at Cloudflare, including cached pages.'} badge={edgeBadge} />
    </Paper>

    {!edge.configured && <Alert color="yellow" icon={<FiAlertTriangle />} title="Edge blocking not connected" className={styles.alert}>Blocking runs on the server only. Connect the Cloudflare token before turning the page cache back on.</Alert>}
    {edge.configured && edge.status === 'error' && <Alert color="red" icon={<FiAlertTriangle />} title="Cloudflare rule out of date" className={styles.alert}>{edge.message}<Button display="block" mt="xs" size="compact-sm" variant="white" onClick={sync} loading={saving}>Retry sync</Button></Alert>}

    <Section icon={<FiGlobe />} title="Country blocking">
      <Stack gap="md">
        <Switch checked={form.geoEnabled} onChange={event => set('geoEnabled', event.currentTarget.checked)} label="Block the selected countries" description="Blocked visitors see “not available in your region” and cannot load pages, pictures or the API." />
        <MultiSelect label="Blocked countries" placeholder={form.blockedCountries.length ? '' : 'Search countries'} data={options} value={form.blockedCountries} onChange={value => set('blockedCountries', value)} searchable clearable hidePickedOptions maxValues={60} nothingFoundMessage="No country matches" comboboxProps={{ withinPortal: true }} />
        <Switch checked={form.blockTor} onChange={event => set('blockTor', event.currentTarget.checked)} label="Block the Tor network" description="Tor hides a visitor’s real country." />
        <Switch checked={form.blockUnknown} onChange={event => set('blockUnknown', event.currentTarget.checked)} label="Block unknown locations" description="Visitors Cloudflare cannot place in a country." />
        <Switch color="red" checked={form.protectAdmin} onChange={event => set('protectAdmin', event.currentTarget.checked)} label="Also block them on the admin panel" description={`Applies to ${data.hosts.admin}. Allowlisted addresses still get in.`} />
        {youBlockedOnSite && !adminRisk && <Alert color="blue" icon={<FiShield />} className={styles.alert}>From this connection ({countryName(data.you.country)}) you will not see the public site. Add your IP to the allowlist to view it.</Alert>}
      </Stack>
    </Section>

    <Section icon={<FiUserCheck />} title="Allowlist">
      <TagsInput label="Never blocked" description="IP addresses or ranges, e.g. 203.0.113.7 or 203.0.113.0/24." placeholder="Add an IP, then Enter" value={form.allowlist} onChange={value => set('allowlist', value.map(item => item.trim()).filter(Boolean))} maxTags={50} clearable splitChars={[',', ' ']} />
      {data.you.ip && !form.allowlist.includes(data.you.ip) && <Button mt="sm" size="compact-sm" variant="subtle" onClick={() => set('allowlist', [...form.allowlist, data.you.ip])}>Add my current IP ({data.you.ip})</Button>}
      <Text size="xs" c="dimmed" mt={6}>Mobile networks change IPs often. A fixed address never changes.</Text>
      <Switch mt="md" checked={form.adminAllowlistOnly} onChange={event => set('adminAllowlistOnly', event.currentTarget.checked)} label="Admin panel only for allowlisted addresses" description="Strongest setting: the admin panel answers nobody outside this list, from any country." />
    </Section>

    <Section icon={<FiServer />} title="Server protection">
      <Switch checked={form.cloudflareOnly} onChange={event => set('cloudflareOnly', event.currentTarget.checked)} label="Only accept visitors through Cloudflare" description="Refuses direct connections that try to get around Cloudflare or find the server. Keep this on." />
    </Section>

    <Section icon={<FiShield />} title="Blocked requests · last 7 days">
      {totals.length ? <div className={styles.stats}>{totals.map(([reason, total]) => <div key={reason} className={styles.statRow}><Text size="sm">{countryName(reason)}</Text><Text size="sm" fw={700}>{total.toLocaleString()}</Text></div>)}</div> : <Text size="sm" c="dimmed">Nothing blocked yet.</Text>}
      <Text size="xs" c="dimmed" mt="sm">Counted by the server. Cloudflare edge blocks appear under Security → Events in Cloudflare.</Text>
    </Section>

    {(dirty || adminRisk) && <div className={styles.saveBar} role="region" aria-label="Unsaved changes">
      {adminRisk ? <Text size="xs" c="red.7" className={styles.saveNote}><FiLock /> Allowlist your current IP first, or you will be locked out.</Text> : <Text size="xs" c="dimmed" className={styles.saveNote}>Unsaved changes</Text>}
      <Group gap="xs" wrap="nowrap">
        <Button variant="default" size="sm" disabled={saving} onClick={() => setDraft(null)}>Discard</Button>
        <Button size="sm" disabled={!dirty || adminRisk} onClick={() => setConfirming(true)}>Save</Button>
      </Group>
    </div>}
    {edge.configured && <Button variant="default" leftSection={<FiRefreshCw />} onClick={sync} loading={saving && !confirming}>Sync Cloudflare now</Button>}

    <Modal opened={confirming} onClose={() => setConfirming(false)} title="Apply protection settings?" centered>
      <Stack gap="xs">
        <Text size="sm">{form.geoEnabled ? <>Visitors from <b>{form.blockedCountries.map(countryName).join(', ') || 'no countries'}</b>{form.blockTor ? ', the Tor network' : ''}{form.blockUnknown ? ', unknown locations' : ''} will be blocked on the public site{form.protectAdmin ? ' and the admin panel' : ''}.</> : 'Country blocking will be off.'}</Text>
        {form.adminAllowlistOnly && <Text size="sm">The admin panel will only answer allowlisted addresses.</Text>}
        <Text size="sm">{form.allowlist.length ? `${form.allowlist.length} allowlisted address(es) are never blocked.` : 'No addresses are allowlisted.'}</Text>
        <Group justify="flex-end" mt="sm" grow><Button variant="default" onClick={() => setConfirming(false)}>Cancel</Button><Button color={form.geoEnabled || form.adminAllowlistOnly ? 'red' : undefined} loading={saving} onClick={save}>Apply</Button></Group>
      </Stack>
    </Modal>
  </Stack>;
}
