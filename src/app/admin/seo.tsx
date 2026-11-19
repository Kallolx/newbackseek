'use client';
import { useMemo, useState, type ReactNode } from 'react';
import { Accordion, ActionIcon, Alert, Anchor, Badge, Button, Group, NumberInput, Paper, Progress, Select, SimpleGrid, Skeleton, Stack, Switch, Tabs, TagsInput, Text, TextInput, Textarea, Title } from '@mantine/core';
import { FiAlertTriangle, FiCheckCircle, FiExternalLink, FiGlobe, FiLink, FiPlus, FiSearch, FiSend, FiSettings, FiTrash2, FiType, FiXCircle } from 'react-icons/fi';
import { adminApi, useAdminResource } from './live-api';
import type { CategoryGroup, LocationCountry } from './admin-data';
import { toast } from '../../components/toast';
import { EmptyState } from '../../components/page-state';
import { DESCRIPTION_LIMIT, TITLE_LIMIT, expand, type SeoSettings } from '../../lib/seo-core';
import styles from './security.module.css';

type PageRow = { path: string; title: string | null; description: string | null; h1: string | null; intro: string | null; canonical: string | null; og_image: string | null; noindex: boolean; updated_at: string };
type RedirectRow = { from_path: string; to_path: string | null; status: number; hits: number; note: string | null };
type Submission = { engine: string; url_count: number; ok: boolean; status_code: number | null; note: string | null; created_at: string };
type Data = { settings: SeoSettings; defaults: SeoSettings; pages: PageRow[]; redirects: RedirectRow[]; submissions: Submission[]; origin: string };
type Health = {
  robots: { status: number; sitemapListed: boolean; blocksEverything: boolean }; sitemap: { status: number; children: number }; indexnow: { status: number; matches: boolean; last: { created_at: string; ok: boolean; url_count: number } | null };
  counts: { ads: number; cities: number; overrides: number; redirects: number; listingPages: number }; verification: Record<string, boolean>; siteNoindex: boolean; hasOgImage: boolean; hasLogo: boolean; sameAsCount: number; analytics: { ga4: boolean; cloudflareBeacon: boolean };
};
type Inspect = { path: string; status: number; redirect: string; ms: number; title: string; description: string; canonical: string; robots: string; xRobots: string; og: { title: string; description: string; image: string; type: string }; twitterCard: string; h1: string[]; schemas: string[]; words: number; links: number; images: number; imagesWithoutAlt: number };

const SAMPLE = { site: 'BackpageNew', country: 'United States', region: 'Arizona', city: 'Phoenix', category: 'Women Seeking Men', title: 'Friendly dog walker in Midtown, evenings and weekends', excerpt: 'Friendly and reliable, available evenings and weekends in Midtown. Message me to arrange a time.', adsLine: '24 active ads right now.' };
const kinds: { key: keyof SeoSettings['templates']; label: string; tokens: string }[] = [
  { key: 'home', label: 'Home page', tokens: '{site}' }, { key: 'country', label: 'Country page', tokens: '{country} {site}' }, { key: 'region', label: 'State / region page', tokens: '{region} {country} {site}' },
  { key: 'city', label: 'City page', tokens: '{city} {region} {country} {adsLine} {site}' }, { key: 'category', label: 'City + category page', tokens: '{category} {city} {region} {adsLine} {site}' },
  { key: 'ad', label: 'Single ad', tokens: '{title} {category} {city} {excerpt} {site}' }, { key: 'blog', label: 'Blog article', tokens: '{title} {excerpt} {site}' }, { key: 'page', label: 'Other pages', tokens: '{title} {excerpt} {site}' },
];
const commonPages = [['/', 'Home'], ['/browse', 'All cities'], ['/about', 'About'], ['/backpage-alternative', 'Backpage alternative'], ['/personals', 'Personals'], ['/dating', 'Dating'], ['/classifieds', 'Classifieds'], ['/blog', 'Blog'], ['/contact', 'Contact'], ['/guidelines', 'Guidelines']];

function Counter({ value, limit }: { value: string; limit: number }) {
  const n = value.length; const color = n === 0 ? 'dimmed' : n > limit ? 'red.7' : n < limit * 0.5 ? 'orange.7' : 'teal.7';
  return <Text size="xs" c={color}>{n} / {limit}</Text>;
}
/** How the page may look in Google search results. */
function Snippet({ title, description, url }: { title: string; description: string; url: string }) {
  return <div className={styles.snippet}><Text size="xs" c="dimmed" truncate>{url}</Text><Text className={styles.snippetTitle} lineClamp={2}>{title || 'Title'}</Text><Text size="sm" c="dimmed" lineClamp={3}>{description || 'Description'}</Text></div>;
}
function Section({ icon, title, children, hint }: { icon: ReactNode; title: string; children: ReactNode; hint?: string }) {
  return <Paper withBorder radius="md" p="md"><Group gap={8} mb={hint ? 2 : 'sm'} wrap="nowrap"><span className={styles.sectionIcon}>{icon}</span><Title order={3} size="h5">{title}</Title></Group>{hint && <Text size="xs" c="dimmed" mb="sm">{hint}</Text>}{children}</Paper>;
}
const Check = ({ ok, warn, label, hint }: { ok: boolean; warn?: boolean; label: string; hint?: string }) => <Group gap={10} wrap="nowrap" align="flex-start" py={6}>
  {ok ? <FiCheckCircle color="var(--mantine-color-teal-6)" size={18} style={{ flexShrink: 0, marginTop: 2 }} /> : warn ? <FiAlertTriangle color="var(--mantine-color-orange-6)" size={18} style={{ flexShrink: 0, marginTop: 2 }} /> : <FiXCircle color="var(--mantine-color-red-6)" size={18} style={{ flexShrink: 0, marginTop: 2 }} />}
  <div style={{ minWidth: 0 }}><Text size="sm" fw={600}>{label}</Text>{!ok && hint && <Text size="xs" c="dimmed">{hint}</Text>}</div></Group>;

export function SeoCenter({ locations, categories }: { locations: LocationCountry[]; categories: CategoryGroup[] }) {
  const { data, loading, error, reload } = useAdminResource<Data>('/admin/seo');
  const [draft, setDraft] = useState<SeoSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<string | null>('overview');
  if (!data && loading) return <Stack>{[0, 1, 2].map((i) => <Skeleton key={i} height={120} radius="md" />)}</Stack>;
  if (error || !data) return <EmptyState title="SEO settings could not load" description="" action="Retry" onAction={reload} />;
  const form = draft ?? data.settings;
  const dirty = JSON.stringify(form) !== JSON.stringify(data.settings);
  const update = (change: (value: SeoSettings) => void) => { const next = structuredClone(form); change(next); setDraft(next); };

  async function save() {
    setSaving(true);
    try { await adminApi('/admin/seo', { method: 'PUT', body: JSON.stringify(form) }); toast.success('SEO settings saved.'); setDraft(null); reload(); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : 'Could not save.'); }
    finally { setSaving(false); }
  }

  return <Stack>
    <Tabs value={tab} onChange={setTab} keepMounted={false} variant="pills" classNames={{ list: styles.seoTabs }}>
      <Tabs.List>
        <Tabs.Tab value="overview" leftSection={<FiCheckCircle />}>Overview</Tabs.Tab>
        <Tabs.Tab value="brand" leftSection={<FiGlobe />}>Brand</Tabs.Tab>
        <Tabs.Tab value="titles" leftSection={<FiType />}>Titles</Tabs.Tab>
        <Tabs.Tab value="pages" leftSection={<FiSearch />}>Pages</Tabs.Tab>
        <Tabs.Tab value="indexing" leftSection={<FiSettings />}>Indexing</Tabs.Tab>
        <Tabs.Tab value="redirects" leftSection={<FiLink />}>Redirects</Tabs.Tab>
        <Tabs.Tab value="tools" leftSection={<FiSend />}>Tools</Tabs.Tab>
        <Tabs.Tab value="connect" leftSection={<FiExternalLink />}>Connect</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="overview" pt="md"><Overview data={data} form={form} go={setTab} /></Tabs.Panel>
      <Tabs.Panel value="brand" pt="md"><Brand form={form} update={update} /></Tabs.Panel>
      <Tabs.Panel value="titles" pt="md"><Titles form={form} update={update} defaults={data.defaults} /></Tabs.Panel>
      <Tabs.Panel value="pages" pt="md"><Pages data={data} locations={locations} categories={categories} reload={reload} /></Tabs.Panel>
      <Tabs.Panel value="indexing" pt="md"><Indexing form={form} update={update} origin={data.origin} /></Tabs.Panel>
      <Tabs.Panel value="redirects" pt="md"><Redirects data={data} reload={reload} /></Tabs.Panel>
      <Tabs.Panel value="tools" pt="md"><Tools data={data} reload={reload} /></Tabs.Panel>
      <Tabs.Panel value="connect" pt="md"><Connect form={form} update={update} data={data} /></Tabs.Panel>
    </Tabs>
    {dirty && <div className={styles.saveBar} role="region" aria-label="Unsaved changes">
      <Text size="xs" c="dimmed" className={styles.saveNote}>Unsaved changes</Text>
      <Group gap="xs" wrap="nowrap"><Button variant="default" size="sm" disabled={saving} onClick={() => setDraft(null)}>Discard</Button><Button size="sm" loading={saving} onClick={() => void save()}>Save</Button></Group>
    </div>}
  </Stack>;
}

type Update = (change: (value: SeoSettings) => void) => void;

// ---------------- Overview ----------------
function Overview({ data, form, go }: { data: Data; form: SeoSettings; go: (tab: string) => void }) {
  const { data: health, loading, reload } = useAdminResource<Health>('/admin/seo/health');
  if (loading && !health) return <Skeleton height={300} radius="md" />;
  if (!health) return <EmptyState title="The checks could not run" description="" action="Retry" onAction={reload} />;
  const long = Object.values(form.templates).some((tpl) => expand(tpl.title, SAMPLE, 0).length > 70);
  const items = [
    { w: 20, ok: !health.siteNoindex, label: 'The site is open to search engines', hint: 'Indexing → “Hide the whole site” is ON. Turn it off.', tab: 'indexing' },
    { w: 10, ok: health.robots.status === 200 && !health.robots.blocksEverything, label: 'robots.txt works', hint: 'robots.txt does not load or blocks everything.', tab: 'indexing' },
    { w: 10, ok: health.sitemap.status === 200 && health.sitemap.children > 0, label: `Sitemap works (${health.sitemap.children} files)`, hint: 'The sitemap did not load.', tab: 'indexing' },
    { w: 5, ok: health.robots.sitemapListed, label: 'robots.txt points to the sitemap', hint: '', tab: 'indexing' },
    { w: 10, ok: health.verification.google, label: 'Google Search Console connected', hint: 'Add the Google verification code (or verify by DNS in Cloudflare), then submit the sitemap.', tab: 'connect' },
    { w: 5, ok: health.verification.bing, label: 'Bing Webmaster Tools connected', hint: 'Bing also powers DuckDuckGo, Yahoo and ChatGPT search.', tab: 'connect' },
    { w: 10, ok: health.indexnow.status === 200 && health.indexnow.matches && form.indexnow.enabled, label: 'IndexNow is working (new ads reach Bing in minutes)', hint: 'Turn IndexNow on in Connect.', tab: 'connect' },
    { w: 5, ok: health.hasOgImage, warn: true, label: 'Share image set', hint: 'The built-in image is used. Add your own in Brand for nicer link previews.', tab: 'brand' },
    { w: 5, ok: health.hasLogo, warn: true, label: 'Logo set for Google', hint: 'Add your logo address in Brand.', tab: 'brand' },
    { w: 5, ok: health.sameAsCount >= 2, warn: true, label: 'Social profiles linked', hint: 'Add your official profiles in Brand (helps Google trust the brand).', tab: 'brand' },
    { w: 5, ok: !long, warn: true, label: 'Titles are a good length', hint: 'Some templates make titles longer than Google shows.', tab: 'titles' },
    { w: 10, ok: form.indexing.minAdsForListing >= 1, label: 'Empty listing pages are kept out of Google', hint: 'Set the minimum ads to at least 1.', tab: 'indexing' },
  ];
  const score = items.reduce((sum, item) => sum + (item.ok ? item.w : 0), 0);
  return <Stack>
    <SimpleGrid cols={{ base: 2, md: 4 }}>
      {[['SEO score', `${score}/100`], ['Ads in sitemap', health.counts.ads], ['Listing pages', health.counts.listingPages], ['Cities', health.counts.cities]].map(([name, value]) => <Paper key={String(name)} withBorder p="md" radius="md"><Text size="sm" c="dimmed">{name}</Text><Title order={2}>{value}</Title></Paper>)}
    </SimpleGrid>
    <Progress value={score} color={score >= 85 ? 'teal' : score >= 60 ? 'orange' : 'red'} size="lg" radius="xl" />
    <Paper withBorder radius="md" p="md">
      <Group justify="space-between" mb={4}><Title order={3} size="h5">Checklist</Title><Button variant="subtle" size="compact-sm" onClick={reload} loading={loading}>Check again</Button></Group>
      {items.map((item) => <div key={item.label}><Check ok={item.ok} warn={item.warn} label={item.label} hint={item.hint} />{!item.ok && <Button variant="subtle" size="compact-xs" ml={28} onClick={() => go(item.tab)}>Fix this</Button>}</div>)}
    </Paper>
    <Alert color="blue" variant="light" title="Good to know">Google decides rankings. This page gives it clean pages, correct signals and fast discovery. New sites take weeks to months to rank, and links from other websites matter a lot.</Alert>
    {data.submissions[0] && <Text size="xs" c="dimmed">Last IndexNow: {new Date(data.submissions[0].created_at).toLocaleString()} · {data.submissions[0].url_count} addresses · {data.submissions[0].ok ? 'accepted' : 'failed'}</Text>}
  </Stack>;
}

// ---------------- Brand ----------------
function Brand({ form, update }: { form: SeoSettings; update: Update }) {
  return <Stack>
    <Section icon={<FiGlobe />} title="Site">
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 1, sm: 2 }}><TextInput label="Site name" value={form.site.name} onChange={(event) => update((v) => { v.site.name = event.currentTarget.value; })} /><TextInput label="Tagline" value={form.site.tagline} onChange={(event) => update((v) => { v.site.tagline = event.currentTarget.value; })} /></SimpleGrid>
        <div><Textarea label="Default description" autosize minRows={2} value={form.site.description} onChange={(event) => update((v) => { v.site.description = event.currentTarget.value; })} /><Counter value={form.site.description} limit={DESCRIPTION_LIMIT} /></div>
        <TextInput label="Share image address" placeholder="https://… (1200 × 630). Empty = built-in image" value={form.site.ogImage} onChange={(event) => update((v) => { v.site.ogImage = event.currentTarget.value; })} />
        <TextInput label="X / Twitter handle" placeholder="@backpagenew" value={form.site.twitter} onChange={(event) => update((v) => { v.site.twitter = event.currentTarget.value; })} />
      </Stack>
    </Section>
    <Section icon={<FiLink />} title="Organization" hint="Shown to Google as your brand (Knowledge Panel signals).">
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 1, sm: 2 }}><TextInput label="Organization name" value={form.organization.name} onChange={(event) => update((v) => { v.organization.name = event.currentTarget.value; })} /><TextInput label="Support email" value={form.organization.email} onChange={(event) => update((v) => { v.organization.email = event.currentTarget.value; })} /></SimpleGrid>
        <TextInput label="Logo address" placeholder="https://backpagenew.com/brand/backpage-new-logo.png" value={form.organization.logo} onChange={(event) => update((v) => { v.organization.logo = event.currentTarget.value; })} />
        <TagsInput label="Official profiles" description="Full https:// addresses: X, Facebook, Instagram, Reddit, YouTube…" value={form.organization.sameAs} onChange={(value) => update((v) => { v.organization.sameAs = value; })} splitChars={[' ', ',']} clearable />
      </Stack>
    </Section>
    <Section icon={<FiSettings />} title="Structured data" hint="Extra information for Google. Leave all on unless a type causes warnings.">
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        {([['organization', 'Organization (home page)'], ['website', 'Website'], ['breadcrumbs', 'Breadcrumbs'], ['itemList', 'Listing pages'], ['ad', 'Ad pages'], ['blog', 'Blog articles'], ['faq', 'FAQ blocks']] as const).map(([key, label]) => <Switch key={key} label={label} checked={form.schema[key]} onChange={(event) => update((v) => { v.schema[key] = event.currentTarget.checked; })} />)}
      </SimpleGrid>
    </Section>
  </Stack>;
}

// ---------------- Titles ----------------
function Titles({ form, update, defaults }: { form: SeoSettings; update: Update; defaults: SeoSettings }) {
  const [kind, setKind] = useState<keyof SeoSettings['templates']>('city');
  const tpl = form.templates[kind]; const meta = kinds.find((item) => item.key === kind)!;
  const vars = { ...SAMPLE, site: form.site.name };
  const title = expand(tpl.title, vars, TITLE_LIMIT); const description = expand(tpl.description, vars);
  return <Stack>
    <Select label="Page type" value={kind} onChange={(value) => value && setKind(value as keyof SeoSettings['templates'])} allowDeselect={false} data={kinds.map((item) => ({ value: item.key, label: item.label }))} />
    <Paper withBorder radius="md" p="md"><Stack gap="sm">
      <div><TextInput label="Title template" value={tpl.title} onChange={(event) => update((v) => { v.templates[kind].title = event.currentTarget.value; })} /><Group justify="space-between"><Text size="xs" c="dimmed">Words you can use: {meta.tokens}</Text><Counter value={title} limit={TITLE_LIMIT} /></Group></div>
      <div><Textarea label="Description template" autosize minRows={2} value={tpl.description} onChange={(event) => update((v) => { v.templates[kind].description = event.currentTarget.value; })} /><Counter value={description} limit={DESCRIPTION_LIMIT} /></div>
      <Button variant="subtle" size="compact-sm" style={{ alignSelf: 'flex-start' }} onClick={() => update((v) => { v.templates[kind] = structuredClone(defaults.templates[kind]); })}>Reset to recommended</Button>
    </Stack></Paper>
    <Text size="sm" fw={600}>How it looks on Google (example)</Text>
    <Snippet title={title} description={description} url={`backpagenew.com › ${kind === 'home' ? '' : kind}`} />
    <Text size="xs" c="dimmed">Aim for titles under {TITLE_LIMIT} characters and descriptions near {DESCRIPTION_LIMIT}. Put the words people search for first (for example “New Backpage”, the city and the category). A single page can have its own text in the Pages tab.</Text>
  </Stack>;
}

// ---------------- Pages ----------------
function Pages({ data, locations, categories, reload }: { data: Data; locations: LocationCountry[]; categories: CategoryGroup[]; reload: () => void }) {
  const [country, setCountry] = useState<string | null>(null); const [region, setRegion] = useState<string | null>(null); const [city, setCity] = useState<string | null>(null); const [category, setCategory] = useState<string | null>(null);
  const [path, setPath] = useState('');
  const [form, setForm] = useState({ title: '', description: '', h1: '', intro: '', canonical: '', ogImage: '', noindex: false });
  const [busy, setBusy] = useState(false);
  const regions = locations.find((item) => item.code === country)?.regions ?? []; const cities = regions.find((item) => item.id === region)?.cities ?? [];
  const services = useMemo(() => categories.flatMap((group) => group.services), [categories]);
  function choose(value: string) {
    setPath(value);
    const row = data.pages.find((page) => page.path === value);
    setForm({ title: row?.title || '', description: row?.description || '', h1: row?.h1 || '', intro: row?.intro || '', canonical: row?.canonical || '', ogImage: row?.og_image || '', noindex: row?.noindex || false });
  }
  const exists = data.pages.some((page) => page.path === path);
  async function save() { setBusy(true); try { await adminApi('/admin/seo/page', { method: 'PUT', body: JSON.stringify({ path, ...form }) }); toast.success('Page saved. It is live within a couple of minutes.'); reload(); } catch (cause) { toast.error((cause as Error).message); } finally { setBusy(false); } }
  async function remove() { setBusy(true); try { await adminApi('/admin/seo/page?path=' + encodeURIComponent(path), { method: 'DELETE' }); toast.success('Back to the automatic text.'); choose(''); reload(); } catch (cause) { toast.error((cause as Error).message); } finally { setBusy(false); } }
  const set = (key: keyof typeof form, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));
  return <Stack>
    <Section icon={<FiSearch />} title="Choose a page" hint="Pick a place, or a common page, or type an address. Write your own title, description and text for it.">
      <Stack gap="sm">
        <Select label="Common pages" placeholder="Choose…" clearable data={commonPages.map(([value, label]) => ({ value, label }))} value={commonPages.some(([value]) => value === path) ? path : null} onChange={(value) => value && choose(value)} />
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Select label="Country" searchable clearable data={locations.map((item) => ({ value: item.code, label: item.name }))} value={country} onChange={(value) => { setCountry(value); setRegion(null); setCity(null); setCategory(null); if (value) choose('/browse/' + value); }} />
          <Select label="State / region" searchable clearable disabled={!country} data={regions.map((item) => ({ value: item.id, label: item.name }))} value={region} onChange={(value) => { setRegion(value); setCity(null); setCategory(null); if (value) choose(value); }} />
          <Select label="City" searchable clearable disabled={!region} data={cities.map((item) => ({ value: item.id, label: item.name }))} value={city} onChange={(value) => { setCity(value); setCategory(null); if (value) choose(value); }} />
          <Select label="Category" searchable clearable disabled={!city} data={services.map((item) => ({ value: item.slug, label: item.name }))} value={category} onChange={(value) => { setCategory(value); if (city && value) choose(city + '/' + value); }} />
        </SimpleGrid>
        <TextInput label="Address" placeholder="/browse/us/arizona/phoenix" value={path} onChange={(event) => choose(event.currentTarget.value.trim())} />
      </Stack>
    </Section>
    {path.startsWith('/') && <Section icon={<FiType />} title={path === '/' ? 'Home page' : path}>
      <Stack gap="sm">
        <Snippet title={form.title || '(automatic title)'} description={form.description || '(automatic description)'} url={'backpagenew.com' + path} />
        <div><TextInput label="Title" value={form.title} onChange={(event) => set('title', event.currentTarget.value)} placeholder="Empty = automatic" /><Counter value={form.title} limit={TITLE_LIMIT} /></div>
        <div><Textarea label="Description" autosize minRows={2} value={form.description} onChange={(event) => set('description', event.currentTarget.value)} placeholder="Empty = automatic" /><Counter value={form.description} limit={DESCRIPTION_LIMIT} /></div>
        <TextInput label="Main heading (H1)" value={form.h1} onChange={(event) => set('h1', event.currentTarget.value)} placeholder="Empty = automatic" />
        <Textarea label="Text shown on the page" description="Real, useful text about this place or topic helps it rank. A blank line starts a new paragraph." autosize minRows={4} maxRows={14} value={form.intro} onChange={(event) => set('intro', event.currentTarget.value)} />
        <SimpleGrid cols={{ base: 1, sm: 2 }}><TextInput label="Canonical address (advanced)" value={form.canonical} onChange={(event) => set('canonical', event.currentTarget.value)} placeholder="Empty = this page" /><TextInput label="Share image address" value={form.ogImage} onChange={(event) => set('ogImage', event.currentTarget.value)} placeholder="Empty = default" /></SimpleGrid>
        <Switch label="Keep this page out of Google (noindex)" checked={form.noindex} onChange={(event) => set('noindex', event.currentTarget.checked)} />
        <Group justify="space-between"><div>{exists && <Button color="red" variant="subtle" leftSection={<FiTrash2 />} onClick={() => void remove()} loading={busy}>Remove custom text</Button>}</div><Button onClick={() => void save()} loading={busy}>Save page</Button></Group>
      </Stack>
    </Section>}
    <Section icon={<FiSettings />} title={`Customised pages (${data.pages.length})`}>
      {!data.pages.length ? <Text size="sm" c="dimmed">None yet.</Text> : <Stack gap={6}>{data.pages.map((page) => <Paper key={page.path} withBorder p="sm" radius="md"><Group justify="space-between" wrap="nowrap"><div style={{ minWidth: 0 }}><Text size="sm" fw={600} truncate>{page.path}</Text><Text size="xs" c="dimmed" truncate>{page.title || page.h1 || page.description || (page.intro ? 'Page text' : '')}</Text></div><Group gap={6} wrap="nowrap">{page.noindex && <Badge color="red" variant="light">noindex</Badge>}<Button size="compact-sm" variant="default" onClick={() => { choose(page.path); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Edit</Button></Group></Group></Paper>)}</Stack>}
    </Section>
  </Stack>;
}

// ---------------- Indexing ----------------
function Indexing({ form, update, origin }: { form: SeoSettings; update: Update; origin: string }) {
  const [confirm, setConfirm] = useState(false);
  return <Stack>
    <Section icon={<FiSettings />} title="What Google may index">
      <Stack gap="md">
        <NumberInput label="Minimum ads before a city + category page is indexed" description="Pages with fewer ads stay out of Google and out of the sitemap (thin pages hurt rankings). 1 is recommended." min={0} max={50} value={form.indexing.minAdsForListing} onChange={(value) => update((v) => { v.indexing.minAdsForListing = Number(value) || 0; })} />
        <NumberInput label="Stop indexing ads older than (days)" description="0 = never. Old ads rarely help searchers." min={0} max={3650} value={form.indexing.adMaxAgeDays} onChange={(value) => update((v) => { v.indexing.adMaxAgeDays = Number(value) || 0; })} />
        <Switch label="Mark the site as adult (age rating tags)" description="Helps filters and Google SafeSearch classify the site correctly." checked={form.indexing.adultRating} onChange={(event) => update((v) => { v.indexing.adultRating = event.currentTarget.checked; })} />
      </Stack>
    </Section>
    <Section icon={<FiGlobe />} title="Sitemaps" hint="Search engines read these to find every page.">
      <Stack gap="sm">
        {([['pages', 'Site pages and blog'], ['locations', 'Countries, states and cities'], ['listings', 'City + category pages that have ads'], ['ads', 'Individual ads']] as const).map(([key, label]) => <Switch key={key} label={label} checked={form.indexing.sitemaps[key]} onChange={(event) => update((v) => { v.indexing.sitemaps[key] = event.currentTarget.checked; })} />)}
        <Switch label="Include ad pictures in the ads sitemap" checked={form.indexing.imagesInSitemap} onChange={(event) => update((v) => { v.indexing.imagesInSitemap = event.currentTarget.checked; })} />
        <Group gap="md"><Anchor href={origin + '/sitemap.xml'} target="_blank" size="sm">Open sitemap.xml <FiExternalLink size={12} /></Anchor><Anchor href={origin + '/robots.txt'} target="_blank" size="sm">Open robots.txt <FiExternalLink size={12} /></Anchor><Anchor href={origin + '/llms.txt'} target="_blank" size="sm">Open llms.txt <FiExternalLink size={12} /></Anchor></Group>
      </Stack>
    </Section>
    <Section icon={<FiSettings />} title="robots.txt" hint="Members’ pages, login and the API are always hidden from search engines.">
      <Stack gap="sm">
        <Switch label="Block AI training crawlers" description="GPTBot, CCBot, Google-Extended, ClaudeBot, Bytespider and others. Google search is not affected." checked={form.robots.blockTrainingBots} onChange={(event) => update((v) => { v.robots.blockTrainingBots = event.currentTarget.checked; })} />
        <Switch label="Block all AI crawlers, including AI search" description="Hides the site from ChatGPT search, Perplexity and similar answer engines too." checked={form.robots.blockAllAiBots} onChange={(event) => update((v) => { v.robots.blockAllAiBots = event.currentTarget.checked; })} />
        <Textarea label="Extra rules (advanced)" description="User-agent, Allow, Disallow, Crawl-delay and Sitemap lines only." autosize minRows={3} value={form.robots.extra} onChange={(event) => update((v) => { v.robots.extra = event.currentTarget.value; })} styles={{ input: { fontFamily: 'ui-monospace, monospace', fontSize: 13 } }} />
      </Stack>
    </Section>
    <Section icon={<FiGlobe />} title="llms.txt" hint="A short summary for AI assistants.">
      <Stack gap="sm"><Switch label="Publish llms.txt" checked={form.llms.enabled} onChange={(event) => update((v) => { v.llms.enabled = event.currentTarget.checked; })} /><Textarea label="Custom text (empty = automatic)" autosize minRows={3} value={form.llms.text} onChange={(event) => update((v) => { v.llms.text = event.currentTarget.value; })} /></Stack>
    </Section>
    <Paper withBorder radius="md" p="md" style={{ borderColor: 'var(--mantine-color-red-3)' }}>
      <Group justify="space-between" wrap="nowrap"><div><Text fw={700} size="sm">Hide the whole site from search engines</Text><Text size="xs" c="dimmed">Emergency switch. The site disappears from Google over time.</Text></div>
        <Switch color="red" checked={form.indexing.siteNoindex} onChange={(event) => { if (event.currentTarget.checked) setConfirm(true); else update((v) => { v.indexing.siteNoindex = false; }); }} aria-label="Hide the whole site" /></Group>
      {confirm && <Alert color="red" mt="sm" title="Hide the whole site?"><Text size="sm">Google and Bing will stop listing every page. Only turn this on while the site is being rebuilt.</Text><Group mt="xs"><Button size="compact-sm" color="red" onClick={() => { update((v) => { v.indexing.siteNoindex = true; }); setConfirm(false); }}>Yes, hide it</Button><Button size="compact-sm" variant="default" onClick={() => setConfirm(false)}>Cancel</Button></Group></Alert>}
    </Paper>
  </Stack>;
}

// ---------------- Redirects ----------------
function Redirects({ data, reload }: { data: Data; reload: () => void }) {
  const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [status, setStatus] = useState<string | null>('301'); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false);
  async function add() { setBusy(true); try { await adminApi('/admin/seo/redirect', { method: 'PUT', body: JSON.stringify({ from, to, status: Number(status), note }) }); toast.success('Redirect saved.'); setFrom(''); setTo(''); setNote(''); reload(); } catch (cause) { toast.error((cause as Error).message); } finally { setBusy(false); } }
  async function remove(path: string) { try { await adminApi('/admin/seo/redirect?from=' + encodeURIComponent(path), { method: 'DELETE' }); toast.success('Redirect removed.'); reload(); } catch (cause) { toast.error((cause as Error).message); } }
  return <Stack>
    <Section icon={<FiLink />} title="Add a redirect" hint="Send visitors and search engines from an old address to a new one. Use 301 for permanent moves, 410 for pages that are gone for good.">
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 1, sm: 2 }}><TextInput label="From" placeholder="/old-page" value={from} onChange={(event) => setFrom(event.currentTarget.value.trim())} /><TextInput label="To" placeholder="/new-page" value={to} disabled={status === '410'} onChange={(event) => setTo(event.currentTarget.value.trim())} /></SimpleGrid>
        <SimpleGrid cols={{ base: 1, sm: 2 }}><Select label="Type" allowDeselect={false} value={status} onChange={setStatus} data={[{ value: '301', label: '301 · Moved permanently' }, { value: '302', label: '302 · Temporary' }, { value: '308', label: '308 · Permanent (keeps method)' }, { value: '410', label: '410 · Gone' }]} /><TextInput label="Note (optional)" value={note} onChange={(event) => setNote(event.currentTarget.value)} /></SimpleGrid>
        <Button leftSection={<FiPlus />} disabled={!from.startsWith('/')} loading={busy} onClick={() => void add()} style={{ alignSelf: 'flex-start' }}>Add redirect</Button>
      </Stack>
    </Section>
    <Section icon={<FiLink />} title={`Redirects (${data.redirects.length})`}>
      {!data.redirects.length ? <Text size="sm" c="dimmed">None yet.</Text> : <Stack gap={6}>{data.redirects.map((row) => <Paper key={row.from_path} withBorder p="sm" radius="md"><Group justify="space-between" wrap="nowrap" gap="xs">
        <div style={{ minWidth: 0 }}><Text size="sm" fw={600} truncate>{row.from_path} → {row.status === 410 ? 'gone' : row.to_path}</Text><Text size="xs" c="dimmed">{row.status} · {row.hits} visit{row.hits === 1 ? '' : 's'}{row.note ? ' · ' + row.note : ''}</Text></div>
        <ActionIcon variant="subtle" color="red" aria-label={'Remove redirect ' + row.from_path} onClick={() => void remove(row.from_path)}><FiTrash2 /></ActionIcon></Group></Paper>)}</Stack>}
    </Section>
  </Stack>;
}

// ---------------- Tools ----------------
function Tools({ data, reload }: { data: Data; reload: () => void }) {
  const [path, setPath] = useState('/'); const [busy, setBusy] = useState(false); const [result, setResult] = useState<Inspect | null>(null);
  const [urls, setUrls] = useState(''); const [sending, setSending] = useState(false);
  async function inspect() { setBusy(true); setResult(null); try { setResult(await adminApi<Inspect>('/admin/seo/inspect', { method: 'POST', body: JSON.stringify({ path }) })); } catch (cause) { toast.error((cause as Error).message); } finally { setBusy(false); } }
  async function submit(everything = false) { setSending(true); try { const list = urls.split(/\s+/).map((item) => item.replace(/^https?:\/\/[^/]+/, '')).filter((item) => item.startsWith('/')); const out = await adminApi<{ sent: number }>('/admin/seo/indexnow', { method: 'POST', body: JSON.stringify({ urls: list, everything }) }); toast.success(`${out.sent} addresses sent to Bing and other search engines.`); setUrls(''); reload(); } catch (cause) { toast.error((cause as Error).message); } finally { setSending(false); } }
  const r = result;
  return <Stack>
    <Section icon={<FiSearch />} title="Check a page" hint="Shows what a search engine sees on any page of your site.">
      <Group align="flex-end" wrap="nowrap"><TextInput style={{ flex: 1 }} label="Address" value={path} onChange={(event) => setPath(event.currentTarget.value.trim())} placeholder="/browse/us/arizona/phoenix" /><Button loading={busy} disabled={!path.startsWith('/')} onClick={() => void inspect()}>Check</Button></Group>
      {r && <Stack gap={0} mt="md">
        <Check ok={r.status === 200} warn={r.status >= 300 && r.status < 400} label={`Status ${r.status}${r.redirect ? ' → ' + r.redirect : ''} · ${r.ms} ms`} hint="Pages should answer 200." />
        <Check ok={r.title.length >= 20 && r.title.length <= 70} warn label={`Title (${r.title.length}): ${r.title}`} hint="Aim for 30–60 characters." />
        <Check ok={r.description.length >= 70 && r.description.length <= 170} warn label={`Description (${r.description.length}): ${r.description || 'missing'}`} hint="Aim for 70–160 characters." />
        <Check ok={Boolean(r.canonical)} label={`Canonical: ${r.canonical || 'missing'}`} hint="Every page needs a canonical address." />
        <Check ok={!/noindex/i.test(r.robots + r.xRobots)} warn label={`Robots: ${r.robots || 'index, follow (default)'}`} hint="This page is kept out of Google." />
        <Check ok={r.h1.length === 1} warn label={`Main heading (H1): ${r.h1.length ? r.h1.join(' | ') : 'missing'}`} hint="Use exactly one H1." />
        <Check ok={Boolean(r.og.image)} warn label={`Share image: ${r.og.image || 'missing'}`} />
        <Check ok={r.schemas.length > 0} warn label={`Structured data: ${r.schemas.length ? r.schemas.join(', ') : 'none'}`} />
        <Check ok={r.imagesWithoutAlt === 0} warn label={`${r.images} pictures, ${r.imagesWithoutAlt} without a description`} hint="Add alt text to every picture." />
        <Text size="xs" c="dimmed" mt="xs">{r.words} words · {r.links} links</Text>
      </Stack>}
    </Section>
    <Section icon={<FiSend />} title="Tell Bing and others about pages now" hint="IndexNow. New and changed ads are sent automatically every few minutes; use this for other pages.">
      <Stack gap="sm">
        <Textarea label="Addresses (one per line)" placeholder={'/browse/us/arizona/phoenix\n/backpage-alternative'} autosize minRows={3} value={urls} onChange={(event) => setUrls(event.currentTarget.value)} />
        <Group><Button leftSection={<FiSend />} loading={sending} disabled={!urls.trim()} onClick={() => void submit(false)}>Send</Button><Button variant="default" loading={sending} onClick={() => void submit(true)}>Send everything (latest 10,000 ads and all listing pages)</Button></Group>
        {data.submissions.length > 0 && <Stack gap={2}>{data.submissions.slice(0, 8).map((item, index) => <Text key={index} size="xs" c={item.ok ? 'dimmed' : 'red.7'}>{new Date(item.created_at).toLocaleString()} · {item.url_count} addresses · {item.ok ? 'accepted' : 'failed' + (item.note ? ': ' + item.note : '')}</Text>)}</Stack>}
      </Stack>
    </Section>
  </Stack>;
}

// ---------------- Connect ----------------
function Connect({ form, update, data }: { form: SeoSettings; update: Update; data: Data }) {
  const field = (key: keyof SeoSettings['verification'], label: string, placeholder: string) => <TextInput key={key} label={label} placeholder={placeholder} value={form.verification[key]} onChange={(event) => update((v) => { v.verification[key] = event.currentTarget.value.trim(); })} />;
  return <Stack>
    <Section icon={<FiExternalLink />} title="Step by step: get listed" hint="Do these once. They tell Google and Bing your site exists.">
      <Accordion variant="contained" radius="md">
        <Accordion.Item value="google"><Accordion.Control>1 · Google Search Console</Accordion.Control><Accordion.Panel><Stack gap={4}>
          <Text size="sm">Open <Anchor href="https://search.google.com/search-console" target="_blank">search.google.com/search-console</Anchor> and sign in.</Text>
          <Text size="sm">Add property → <b>Domain</b> → enter <b>backpagenew.com</b> → copy the TXT record it shows.</Text>
          <Text size="sm">Cloudflare → DNS → Add record → Type <b>TXT</b>, Name <b>@</b>, paste the value → Save. Back in Google, click Verify.</Text>
          <Text size="sm">Sitemaps → enter <b>sitemap.xml</b> → Submit. Then URL Inspection → paste the home page → Request indexing (do the same for /backpage-alternative, /personals, /dating and a few cities).</Text>
        </Stack></Accordion.Panel></Accordion.Item>
        <Accordion.Item value="bing"><Accordion.Control>2 · Bing Webmaster Tools</Accordion.Control><Accordion.Panel><Stack gap={4}>
          <Text size="sm">Open <Anchor href="https://www.bing.com/webmasters" target="_blank">bing.com/webmasters</Anchor> and sign in.</Text>
          <Text size="sm">Choose <b>Import from Google Search Console</b> (one click), or add the site and paste the Bing code below.</Text>
          <Text size="sm">Sitemaps → submit <b>https://backpagenew.com/sitemap.xml</b>. Bing also feeds DuckDuckGo, Yahoo and ChatGPT search.</Text>
        </Stack></Accordion.Panel></Accordion.Item>
        <Accordion.Item value="cloudflare"><Accordion.Control>3 · Cloudflare settings</Accordion.Control><Accordion.Panel><Stack gap={4}>
          <Text size="sm">Caching → Configuration → turn <b>Crawler Hints</b> on (it tells Bing and others when pages change).</Text>
          <Text size="sm">Security → Bots: leave <b>Verified bots</b> allowed so Googlebot and Bingbot are never blocked. Check Security → Events now and then for blocked crawlers.</Text>
          <Text size="sm">SSL/TLS → Edge Certificates → <b>Always Use HTTPS</b> on.</Text>
        </Stack></Accordion.Panel></Accordion.Item>
        <Accordion.Item value="weekly"><Accordion.Control>4 · Every week</Accordion.Control><Accordion.Panel><Stack gap={4}>
          <Text size="sm">Google Search Console → Pages: look at “Not indexed” reasons. Performance: see which searches bring visitors.</Text>
          <Text size="sm">Write a short unique text for your busiest cities (Pages tab) and add new blog articles. Links from other websites are the biggest ranking factor.</Text>
        </Stack></Accordion.Panel></Accordion.Item>
      </Accordion>
    </Section>
    <Section icon={<FiCheckCircle />} title="Search engine verification" hint="Paste only the code (the value of content=“…”), not the whole tag. Verifying in Cloudflare DNS is the other option and needs no code here.">
      <Stack gap="sm">
        {field('google', 'Google Search Console', 'google-site-verification code')}
        {field('bing', 'Bing Webmaster Tools', 'msvalidate.01 code')}
        {field('yandex', 'Yandex', 'yandex-verification code')}
        {field('baidu', 'Baidu', 'baidu-site-verification code')}
        {field('pinterest', 'Pinterest', 'p:domain_verify code')}
      </Stack>
    </Section>
    <Section icon={<FiSend />} title="IndexNow" hint="Bing, Yandex, DuckDuckGo’s sources and others learn about new ads within minutes.">
      <Stack gap="sm"><Switch label="Send changes automatically" checked={form.indexnow.enabled} onChange={(event) => update((v) => { v.indexnow.enabled = event.currentTarget.checked; })} />
        <Text size="xs" c="dimmed">Your key file: <Anchor href={`${data.origin}/${form.indexnow.key}.txt`} target="_blank" size="xs">{`/${form.indexnow.key}.txt`}</Anchor></Text></Stack>
    </Section>
    <Section icon={<FiGlobe />} title="Analytics (optional)" hint="Loaded after the page is ready, so it does not slow the site.">
      <Stack gap="sm">
        <TextInput label="Google Analytics 4 ID" placeholder="G-XXXXXXXXXX" value={form.analytics.ga4} onChange={(event) => update((v) => { v.analytics.ga4 = event.currentTarget.value.trim(); })} />
        <TextInput label="Cloudflare Web Analytics token" description="Privacy-friendly and free: Cloudflare → Analytics & Logs → Web Analytics." value={form.analytics.cloudflareBeacon} onChange={(event) => update((v) => { v.analytics.cloudflareBeacon = event.currentTarget.value.trim(); })} />
      </Stack>
    </Section>
  </Stack>;
}
