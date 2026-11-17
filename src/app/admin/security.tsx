'use client';
import { useMemo, useState } from 'react';
import { Alert, Badge, Button, Group, Modal, MultiSelect, Paper, SimpleGrid, Skeleton, Stack, Switch, Table, TagsInput, Text, Title } from '@mantine/core';
import { FiAlertTriangle, FiCloud, FiGlobe, FiLock, FiRefreshCw, FiServer, FiShield, FiUserCheck } from 'react-icons/fi';
import { adminApi, useAdminResource } from './live-api';
import { toast } from '../../components/toast';
import { EmptyState } from '../../components/page-state';

type Settings = { geoEnabled: boolean; blockedCountries: string[]; blockTor: boolean; blockUnknown: boolean; protectAdmin: boolean; cloudflareOnly: boolean; allowlist: string[]; edge: { configured: boolean; status: string; message: string; syncedAt: string | null }; updatedAt: string };
type Security = { settings: Settings; you: { ip: string; country: string; allowlisted: boolean }; hosts: { site: string; admin: string; media: string }; stats: { day: string; reason: string; count: number }[] };
type Editable = Omit<Settings, 'edge' | 'updatedAt'>;

const CODES = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW'.split(' ');
const regionNames = typeof Intl !== 'undefined' && 'DisplayNames' in Intl ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;
const countryName = (code: string) => code === 'T1' ? 'Tor network' : code === 'XX' ? 'Unknown location' : code === 'direct' ? 'Bypassed Cloudflare' : (() => { try { return regionNames?.of(code) || code; } catch { return code; } })();
const editable = (settings: Settings): Editable => ({ geoEnabled: settings.geoEnabled, blockedCountries: settings.blockedCountries, blockTor: settings.blockTor, blockUnknown: settings.blockUnknown, protectAdmin: settings.protectAdmin, cloudflareOnly: settings.cloudflareOnly, allowlist: settings.allowlist });
const edgeBadge = (edge: Settings['edge']) => !edge.configured ? <Badge color="gray" variant="light">Not connected</Badge> : edge.status === 'active' ? <Badge color="teal" variant="light">Active</Badge> : edge.status === 'off' ? <Badge color="gray" variant="light">Idle</Badge> : edge.status === 'error' ? <Badge color="red" variant="light">Error</Badge> : <Badge color="yellow" variant="light">Pending</Badge>;

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

  if (!data && loading) return <Stack>{[0, 1, 2].map(i => <Skeleton key={i} height={140} radius="md" />)}</Stack>;
  const form = draft ?? (data ? editable(data.settings) : null);
  if (error || !data || !form) return <EmptyState title="Security settings could not load" description="Retry to load the current protection settings." action="Retry" onAction={reload} />;

  const set = <K extends keyof Editable>(key: K, value: Editable[K]) => setDraft({ ...form, [key]: value });
  const dirty = JSON.stringify(form) !== JSON.stringify(editable(data.settings));
  const youBlockedOnSite = form.geoEnabled && !data.you.allowlisted && !form.allowlist.includes(data.you.ip) && (form.blockedCountries.includes(data.you.country) || (form.blockTor && data.you.country === 'T1'));
  const adminRisk = form.protectAdmin && youBlockedOnSite;
  const edge = data.settings.edge;

  async function save() {
    setSaving(true);
    try { await adminApi('/admin/security', { method: 'PUT', body: JSON.stringify(form) }); toast.success('Protection settings saved.'); setConfirming(false); setDraft(null); reload(); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : 'Could not save the settings.'); }
    finally { setSaving(false); }
  }
  async function sync() {
    setSaving(true);
    try { const result = await adminApi<{ settings: Settings }>('/admin/security/sync', { method: 'POST' }); result.settings.edge.status === 'error' ? toast.error(result.settings.edge.message) : toast.success('Cloudflare rule is up to date.'); reload(); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : 'Sync failed.'); }
    finally { setSaving(false); }
  }

  return <Stack>
    <Group justify="space-between" align="flex-start">
      <div><Title order={2} size="h4">Security & country blocking</Title><Text size="xs" c="dimmed">Decide who can reach the site. Changes apply within a few seconds.</Text></div>
      <Button variant="default" size="xs" leftSection={<FiRefreshCw />} onClick={reload}>Refresh</Button>
    </Group>

    <SimpleGrid cols={{ base: 1, sm: 3 }}>
      <Paper withBorder p="md" radius="md"><Group gap={6}><FiCloud /><Text size="sm" fw={600}>Cloudflare edge rule</Text></Group><Group mt={6} gap={6}>{edgeBadge(edge)}</Group><Text size="xs" c="dimmed" mt={6}>{edge.message || (edge.configured ? 'Not synced yet.' : 'Blocks visitors at Cloudflare, including cached pages.')}</Text></Paper>
      <Paper withBorder p="md" radius="md"><Group gap={6}><FiServer /><Text size="sm" fw={600}>Server gate</Text></Group><Group mt={6} gap={6}><Badge color={data.settings.geoEnabled ? 'teal' : 'gray'} variant="light">{data.settings.geoEnabled ? 'Country blocking on' : 'Country blocking off'}</Badge></Group><Text size="xs" c="dimmed" mt={6}>Checks every page request on the server as a second layer.</Text></Paper>
      <Paper withBorder p="md" radius="md"><Group gap={6}><FiUserCheck /><Text size="sm" fw={600}>Your connection</Text></Group><Text size="sm" mt={6} ff="monospace">{data.you.ip || 'Unknown IP'}</Text><Text size="xs" c="dimmed">{data.you.country ? countryName(data.you.country) : 'Unknown country'}{data.you.allowlisted ? ' · allowlisted' : ''}</Text>
        {data.you.ip && !form.allowlist.includes(data.you.ip) && <Button mt="xs" size="compact-xs" variant="light" onClick={() => set('allowlist', [...form.allowlist, data.you.ip])}>Add my IP to the allowlist</Button>}</Paper>
    </SimpleGrid>

    {!edge.configured && <Alert color="yellow" icon={<FiAlertTriangle />} title="Edge blocking is not connected">Blocking currently runs on the server only. Before turning the Cloudflare page cache back on, connect the Cloudflare API token so cached pages are blocked too. Ask your developer to add CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID.</Alert>}
    {edge.configured && edge.status === 'error' && <Alert color="red" icon={<FiAlertTriangle />} title="Cloudflare rule is out of date">{edge.message} <Button size="compact-xs" variant="white" ml="xs" onClick={sync} loading={saving}>Retry sync</Button></Alert>}

    <Paper withBorder p="md" radius="md">
      <Group gap={8} mb="sm"><FiGlobe /><Title order={3} size="h5">Country blocking</Title></Group>
      <Stack gap="md">
        <Switch checked={form.geoEnabled} onChange={event => set('geoEnabled', event.currentTarget.checked)} label="Block visitors from the selected countries" description="Blocked visitors see “This site is not available in your region” and cannot load pages, pictures or the API." />
        <MultiSelect label="Blocked countries" placeholder={form.blockedCountries.length ? '' : 'Search countries'} data={options} value={form.blockedCountries} onChange={value => set('blockedCountries', value)} searchable clearable hidePickedOptions maxValues={60} nothingFoundMessage="No country matches" />
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Switch checked={form.blockTor} onChange={event => set('blockTor', event.currentTarget.checked)} label="Block the Tor network" description="Tor hides a visitor’s real country." />
          <Switch checked={form.blockUnknown} onChange={event => set('blockUnknown', event.currentTarget.checked)} label="Block unknown locations" description="Visitors Cloudflare cannot place in any country." />
        </SimpleGrid>
        <Switch color="red" checked={form.protectAdmin} onChange={event => set('protectAdmin', event.currentTarget.checked)} label="Also block these countries on the admin panel" description={`Applies to ${data.hosts.admin}. Only allowlisted IPs will be able to reach it from a blocked country.`} />
        {youBlockedOnSite && !adminRisk && <Alert color="blue" icon={<FiShield />}>You are in {countryName(data.you.country)}: with these settings you will not be able to open the public site from this connection unless you add your IP to the allowlist. The admin panel stays reachable.</Alert>}
        {adminRisk && <Alert color="red" icon={<FiLock />} title="This would lock you out">Add your IP ({data.you.ip}) to the allowlist before blocking the admin panel. The server refuses to save settings that lock you out.</Alert>}
      </Stack>
    </Paper>

    <Paper withBorder p="md" radius="md">
      <Group gap={8} mb="sm"><FiUserCheck /><Title order={3} size="h5">Allowlist</Title></Group>
      <TagsInput label="IP addresses or ranges that are never blocked" description="Example: 203.0.113.7 or 203.0.113.0/24. Use this for your team’s connections." placeholder="Type an IP and press Enter" value={form.allowlist} onChange={value => set('allowlist', value.map(item => item.trim()).filter(Boolean))} maxTags={50} clearable splitChars={[',', ' ']} />
      <Text size="xs" c="dimmed" mt={6}>Mobile networks often change IPs. If you are blocked after your IP changes, open the admin panel and add the new IP.</Text>
    </Paper>

    <Paper withBorder p="md" radius="md">
      <Group gap={8} mb="sm"><FiServer /><Title order={3} size="h5">Server protection</Title></Group>
      <Switch checked={form.cloudflareOnly} onChange={event => set('cloudflareOnly', event.currentTarget.checked)} label="Only accept visitors who come through Cloudflare" description="Refuses anyone who connects to the server directly to get around Cloudflare or find where it is hosted. Keep this on." />
    </Paper>

    <Group justify="flex-end" gap="xs">
      {edge.configured && <Button variant="default" leftSection={<FiRefreshCw />} onClick={sync} loading={saving && !confirming}>Sync Cloudflare now</Button>}
      <Button variant="default" disabled={!dirty || saving} onClick={() => setDraft(null)}>Discard</Button>
      <Button disabled={!dirty || adminRisk} onClick={() => setConfirming(true)}>Save protection settings</Button>
    </Group>

    <Paper withBorder p="md" radius="md">
      <Title order={3} size="h5" mb="xs">Blocked requests · last 7 days</Title>
      <Text size="xs" c="dimmed" mb="sm">Requests stopped by the server gate. Requests Cloudflare blocks at the edge appear under Security → Events in the Cloudflare dashboard.</Text>
      {totals.length ? <Table striped withTableBorder><Table.Thead><Table.Tr><Table.Th>Reason</Table.Th><Table.Th ta="right">Requests</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{totals.map(([reason, total]) => <Table.Tr key={reason}><Table.Td>{countryName(reason)}{reason.length === 2 && reason !== 'T1' && reason !== 'XX' ? ` (${reason})` : ''}</Table.Td><Table.Td ta="right">{total.toLocaleString()}</Table.Td></Table.Tr>)}</Table.Tbody></Table> : <Text size="sm" c="dimmed">Nothing blocked yet.</Text>}
    </Paper>

    <Modal opened={confirming} onClose={() => setConfirming(false)} title="Apply protection settings?" centered>
      <Stack gap="xs">
        <Text size="sm">{form.geoEnabled ? <>Visitors from <b>{form.blockedCountries.map(countryName).join(', ') || 'no countries'}</b>{form.blockTor ? ', the Tor network' : ''}{form.blockUnknown ? ', unknown locations' : ''} will be blocked on the public site{form.protectAdmin ? ' and the admin panel' : ''}.</> : 'Country blocking will be turned off.'}</Text>
        <Text size="sm">{form.allowlist.length ? `${form.allowlist.length} allowlisted IP address(es) are never blocked.` : 'No IP addresses are allowlisted.'}</Text>
        <Text size="sm">{form.cloudflareOnly ? 'Direct connections that bypass Cloudflare are refused.' : 'Direct connections that bypass Cloudflare are allowed (not recommended).'}</Text>
        <Group justify="flex-end" mt="sm"><Button variant="default" onClick={() => setConfirming(false)}>Cancel</Button><Button color={form.geoEnabled ? 'red' : undefined} loading={saving} onClick={save}>Apply</Button></Group>
      </Stack>
    </Modal>
  </Stack>;
}
