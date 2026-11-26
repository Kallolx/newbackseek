'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Group, Paper, Select, Stack, Text, TextInput, Title } from '@mantine/core';
import { FiCheck, FiX } from 'react-icons/fi';
import { readSavedPage, textWithLines, type SiteRule, type UntrainedPage } from './saved-post-import';
import { adminApi } from './live-api';
import { toast } from '../../components/toast';

type Key = keyof SiteRule['selectors'];
type Option = { value: string; label: string };
type Candidate = { selector: string; value: string };
const keys: { key: Key; label: string; required?: boolean }[] = [
  { key: 'title', label: 'Title', required: true }, { key: 'description', label: 'Description', required: true },
  { key: 'images', label: 'Post pictures', required: true }, { key: 'age', label: 'Age' },
  { key: 'location', label: 'Location' }, { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' },
];

function cssName(value: string): string { return CSS.escape(value); }

function selectorFor(node: Element, doc: Document): string {
  if (node.id) return `#${cssName(node.id)}`;
  const tag = node.tagName.toLowerCase();
  const classes = [...node.classList].filter(name => !/^(?:active|selected|loaded|hidden|grid-item-\d+|col-|row$)/.test(name)).slice(0, 2);
  const local = tag + classes.map(name => `.${cssName(name)}`).join('');
  if (doc.querySelectorAll(local).length === 1) return local;
  let parent = node.parentElement;
  for (let depth = 0; parent && depth < 4; depth++, parent = parent.parentElement) {
    if (parent.id) return `#${cssName(parent.id)} ${local}`;
    const ancestor = [...parent.classList].filter(name => !/^(?:active|selected|loaded|hidden|col-|row$)/.test(name)).slice(0, 2);
    if (ancestor.length) {
      const candidate = `${parent.tagName.toLowerCase()}${ancestor.map(name => `.${cssName(name)}`).join('')} ${local}`;
      if (doc.querySelectorAll(candidate).length === 1) return candidate;
    }
  }
  return local;
}

function candidateValue(node: Element): string {
  if (node.tagName === 'A' && /^(?:tel|sms|mailto):/i.test(node.getAttribute('href') || '')) return (node.getAttribute('href') || '').replace(/^(?:tel|sms|mailto):/i, '');
  return textWithLines(node).replace(/\s+/g, ' ').trim();
}

function candidates(doc: Document, archived: Map<string, File>, source: URL): Record<Key, Candidate[]> {
  const fields = { title: [] as Candidate[], description: [] as Candidate[], images: [] as Candidate[], age: [] as Candidate[], location: [] as Candidate[], phone: [] as Candidate[], email: [] as Candidate[] };
  const nodes = doc.querySelectorAll('title, meta[name="description"], meta[property="og:title"], meta[property="og:description"], meta[itemprop], h1, h2, h3, p, article, main, td, [class*="title"], [class*="description"], [class*="body"], [class*="city"], [class*="location"], a[href^="tel:"], a[href^="sms:"], a[href^="mailto:"]');
  const add = (key: Key, node: Element, value: string) => {
    if (!value || fields[key].length >= 45) return;
    const selector = selectorFor(node, doc);
    if (!fields[key].some(item => item.selector === selector)) fields[key].push({ selector, value: value.slice(0, 300) });
  };
  for (const node of nodes) {
    const value = candidateValue(node);
    const hint = `${node.getAttribute('class') || ''} ${node.getAttribute('itemprop') || ''} ${node.getAttribute('name') || ''}`;
    if (value.length >= 5 && value.length <= 180 && (/^H[1-3]$/.test(node.tagName) || /title|name/i.test(hint))) add('title', node, value);
    if (value.length >= 20 && value.length <= 5000 && (/description|body|content|about|bio/i.test(hint) || ['P', 'ARTICLE', 'TD', 'MAIN'].includes(node.tagName))) add('description', node, value);
    if (/\b(?:age|years old)\b/i.test(value) && value.length < 180) add('age', node, value);
    if (/city|location|address|area/i.test(hint) && value.length < 180) add('location', node, value);
    if (/^(?:tel|sms):/i.test(node.getAttribute('href') || '') || /telephone|phone/i.test(hint)) add('phone', node, value);
    if (/^mailto:/i.test(node.getAttribute('href') || '') || /email/i.test(hint)) add('email', node, value);
  }
  const imageGroups = new Map<string, Set<string>>();
  for (const image of doc.querySelectorAll('img[src], a[href]')) {
    const path = image.getAttribute('src') || image.getAttribute('href') || '';
    let url: string;
    try { url = new URL(path, source).href; } catch { continue; }
    if (!archived.has(url)) continue;
    for (let parent = image.parentElement, depth = 0; parent && depth < 4; parent = parent.parentElement, depth++) {
      const selector = parent.id ? `#${cssName(parent.id)} ${image.tagName.toLowerCase()}` :
        [...parent.classList].filter(name => !/^(?:active|selected|loaded|hidden|grid-item-\d+|col-|row$)/.test(name)).length ?
          `${parent.tagName.toLowerCase()}${[...parent.classList].filter(name => !/^(?:active|selected|loaded|hidden|grid-item-\d+|col-|row$)/.test(name)).slice(0, 2).map(name => `.${cssName(name)}`).join('')} ${image.tagName.toLowerCase()}` : '';
      if (!selector) continue;
      const set = imageGroups.get(selector) || new Set<string>(); set.add(url); imageGroups.set(selector, set);
    }
  }
  fields.images = [...imageGroups].filter(([, urls]) => urls.size).sort((a, b) => b[1].size - a[1].size).slice(0, 20).map(([selector, urls]) => ({ selector, value: `${urls.size} saved ${urls.size === 1 ? 'picture' : 'pictures'}` }));
  return fields;
}

function options(items: Candidate[]): Option[] { return items.map(item => ({ value: item.selector, label: `${item.value.slice(0, 95)} · ${item.selector}` })); }

export function SiteRuleTrainer({ page, onSaved, onCancel }: { page: UntrainedPage; onSaved: (rule: SiteRule) => void; onCancel: () => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [source, setSource] = useState<URL | null>(null);
  const [available, setAvailable] = useState<Record<Key, Candidate[]> | null>(null);
  const [name, setName] = useState(page.domain.split('.')[0].slice(0, 60));
  const [selectors, setSelectors] = useState<SiteRule['selectors']>({ title: '', description: '', images: '', age: '', location: '', phone: '', email: '' });
  useEffect(() => {
    let live = true;
    readSavedPage(page.file).then(archive => {
      if (!live) return;
      const doc = new DOMParser().parseFromString(archive.markup, 'text/html');
      const values = candidates(doc, archive.images, archive.source);
      setSource(archive.source); setAvailable(values);
      setSelectors({ title: values.title[0]?.selector || '', description: values.description[0]?.selector || '',
        images: values.images[0]?.selector || '', age: values.age[0]?.selector || '',
        location: values.location[0]?.selector || '', phone: values.phone[0]?.selector || '', email: values.email[0]?.selector || '' });
    }).catch(error => toast.error(error instanceof Error ? error.message : 'Could not inspect this file.'))
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [page]);
  const preview = useMemo(() => {
    if (!available) return null;
    return Object.fromEntries(keys.map(({ key }) => [key, available[key].find(candidate => candidate.selector === selectors[key])?.value || 'Not found']));
  }, [available, selectors]);
  async function save() {
    if (!name.trim() || !selectors.title || !selectors.description || !selectors.images) { toast.warning('Choose a site name, title, description and post pictures.'); return; }
    setSaving(true);
    try {
      const response = await adminApi<{ rule: SiteRule }>(`/admin/import-rules/${encodeURIComponent(page.domain)}`, { method: 'PUT', body: JSON.stringify({ name: name.trim(), selectors }) });
      toast.success(`Saved ${name.trim()} layout.`); onSaved(response.rule);
    } catch (error) { toast.error((error as Error).message); }
    finally { setSaving(false); }
  }
  return <Paper withBorder radius="md" p={{ base: 'md', sm: 'lg' }}>
    <Stack gap="md">
      <Group justify="space-between"><div><Title order={3} size="h5">Teach this site</Title><Text size="xs" c="dimmed">{source?.hostname || page.domain}</Text></div><Button variant="subtle" color="gray" size="xs" leftSection={<FiX />} onClick={onCancel}>Close</Button></Group>
      {loading ? <Text size="sm">Reading saved page…</Text> : available && <>
        <TextInput label="Site name" value={name} onChange={event => setName(event.currentTarget.value)} maxLength={60} />
        {keys.map(({ key, label, required }) => <Select key={key} label={label} data={options(available[key])} value={selectors[key] || null} searchable clearable={!required} nothingFoundMessage="No match in this file" onChange={value => setSelectors(previous => ({ ...previous, [key]: value || '' }))} />)}
        <Paper withBorder radius="sm" p="sm"><Text fw={600} size="sm">Extraction preview</Text>{keys.filter(({ key }) => key !== 'images').map(({ key, label }) => <Text key={key} size="xs" lineClamp={key === 'description' ? 3 : 1}><strong>{label}:</strong> {preview?.[key]}</Text>)}<Text size="xs"><strong>Pictures:</strong> {preview?.images}</Text></Paper>
        <Group justify="flex-end"><Button leftSection={<FiCheck />} loading={saving} onClick={() => void save()}>Save layout and import</Button></Group>
      </>}
    </Stack>
  </Paper>;
}
