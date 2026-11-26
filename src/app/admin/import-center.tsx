'use client';

import { useEffect, useRef, useState } from 'react';
import { ActionIcon, Badge, Button, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { FiCheck, FiFileText, FiImage, FiTrash2 } from 'react-icons/fi';
import { readSavedPosts, type ImportedPost, type SiteRule, type UntrainedPage } from './saved-post-import';
import { SiteRuleTrainer } from './site-rule-trainer';
import { adminApi } from './live-api';
import { toast } from '../../components/toast';
import styles from './import-center.module.css';

function ImportCard({ post, onOpen, onRemove }: { post: ImportedPost; onOpen: () => void; onRemove: () => void }) {
  const [cover, setCover] = useState('');
  useEffect(() => {
    const url = post.pictures[0] ? URL.createObjectURL(post.pictures[0]) : '';
    const frame = requestAnimationFrame(() => setCover(url));
    return () => { cancelAnimationFrame(frame); if (url) URL.revokeObjectURL(url); };
  }, [post.pictures]);
  return <Paper withBorder radius="md" className={styles.card}>
    <div className={styles.cover}>{cover ? <img src={cover} alt="" loading="lazy" /> : <FiImage aria-hidden="true" size={30} />}<Badge className={styles.sourceBadge} color="dark" variant="filled" size="xs" title={post.sourceName}>{post.sourceName === 'MegaPersonals' ? 'MEGA' : post.sourceName.slice(0, 5).toUpperCase()}</Badge></div>
    <div className={styles.cardBody}>
      <Group gap="xs" wrap="wrap"><Badge variant="light" color={post.posted ? 'teal' : post.warnings.length ? 'orange' : 'blue'}>{post.posted ? 'Published' : post.warnings.length ? 'Review needed' : 'Ready to review'}</Badge><Text size="xs" c="dimmed">{post.pictures.length} pictures</Text></Group>
      <Text fw={700} size="sm" lineClamp={2}>{post.title || 'Untitled post'}</Text>
      <Text size="xs" c="dimmed" lineClamp={2}>{post.description || 'No description found.'}</Text>
      {post.warnings.length > 0 && !post.posted && <Text size="xs" c="orange.8">{post.warnings.join(' · ')}</Text>}
      <Group gap="xs" mt="auto" wrap="nowrap" className={styles.actions}><Button className={styles.reviewButton} size="xs" leftSection={post.posted ? <FiCheck /> : <FiFileText />} disabled={post.posted} onClick={onOpen}>{post.posted ? 'Published' : 'Review'}</Button><ActionIcon size={30} variant="outline" color="red" radius="sm" aria-label={`Remove ${post.title || 'post'} from queue`} onClick={onRemove}><FiTrash2 size={15} /></ActionIcon></Group>
    </div>
  </Paper>;
}

export function ImportCenter({ defaultOwner, posts, onImport, onOpen, onRemove, onClear }: { defaultOwner: string; posts: ImportedPost[]; onImport: (posts: ImportedPost[]) => void; onOpen: (post: ImportedPost) => void; onRemove: (id: string) => void; onClear: () => void }) {
  const [reading, setReading] = useState(false);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [untrained, setUntrained] = useState<UntrainedPage[]>([]);
  const [training, setTraining] = useState<UntrainedPage | null>(null);
  const [rules, setRules] = useState<SiteRule[]>([]);
  const filesInput = useRef<HTMLInputElement | null>(null);
  const trainingInput = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    let live = true;
    adminApi<{ rules: SiteRule[] }>('/admin/import-rules').then(result => { if (live) setRules(result.rules); })
      .catch(error => toast.error((error as Error).message));
    return () => { live = false; };
  }, []);
  async function importFiles(files: File[]) {
    if (!files.length) return;
    setReading(true);
    try {
      const result = await readSavedPosts(files, rules);
      setSkipped(result.skipped);
      setUntrained(previous => [...previous, ...result.untrained.filter(page => !previous.some(item => item.sourceUrl === page.sourceUrl))]);
      const existing = new Set(posts.map(post => post.id));
      const added = result.posts.filter(post => !existing.has(post.id)).map(post => ({ ...post, owner: defaultOwner, category: 'women-seeking-men' }));
      if (added.length) { onImport(added); toast.success(`${added.length} ${added.length === 1 ? 'post' : 'posts'} added to the review queue.`); }
      else if (result.posts.length) toast.info('These posts are already in the review queue.');
      else if (result.untrained.length) toast.info('Choose a saved page to teach this site layout.');
      else toast.warning('No post detail pages were found.');
    } catch { toast.error('These saved files could not be read. Try choosing the files again.'); }
    finally { setReading(false); }
  }
  async function saveRule(rule: SiteRule) {
    const next = [rule, ...rules.filter(item => item.domain !== rule.domain)];
    setRules(next); setTraining(null);
    const matching = untrained.filter(page => page.domain === rule.domain);
    if (!matching.length) return;
    setReading(true);
    try {
      const result = await readSavedPosts(matching.map(page => page.file), next);
      const existing = new Set(posts.map(post => post.id));
      const added = result.posts.filter(post => !existing.has(post.id)).map(post => ({ ...post, owner: defaultOwner, category: 'women-seeking-men' }));
      if (added.length) onImport(added);
      setUntrained(previous => previous.filter(page => page.domain !== rule.domain));
      setSkipped(previous => [...previous, ...result.skipped]);
      toast.success(`${result.posts.length} ${result.posts.length === 1 ? 'post' : 'posts'} extracted. Review before publishing.`);
    } catch (error) { toast.error((error as Error).message); }
    finally { setReading(false); }
  }
  async function inspectTrainingFile(file?: File) {
    if (!file) return;
    try {
      const { readSavedPage, domainFor } = await import('./saved-post-import');
      const page = await readSavedPage(file);
      setTraining({ file, domain: domainFor(page.source), sourceUrl: page.source.href });
    } catch (error) { toast.error((error as Error).message); }
  }
  return <Stack gap="lg" className={styles.page}>
    <Paper withBorder radius="md" p={{ base: 'md', sm: 'lg' }}><Stack gap="md">
      <div className={styles.dropArea}><Button size="sm" leftSection={<FiFileText />} loading={reading} onClick={() => filesInput.current?.click()}>{posts.length ? 'Add more files' : 'Choose files'}</Button>
        <Button size="sm" variant="light" onClick={() => trainingInput.current?.click()}>Teach or update a site</Button>
        <input ref={filesInput} type="file" hidden multiple aria-label="Choose saved post files" onChange={event => { void importFiles(Array.from(event.currentTarget.files || [])); event.currentTarget.value = ''; }} />
        <input ref={trainingInput} type="file" hidden aria-label="Choose a page to teach a site" onChange={event => { void inspectTrainingFile(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} />
      </div>
      {skipped.length > 0 && <Paper withBorder p="sm" radius="sm"><Text size="sm" fw={600}>Files needing attention</Text>{skipped.slice(0, 8).map(message => <Text key={message} size="xs" c="dimmed">{message}</Text>)}{skipped.length > 8 && <Text size="xs" c="dimmed">And {skipped.length - 8} more.</Text>}</Paper>}
    </Stack></Paper>
    {untrained.length > 0 && <Paper withBorder radius="md" p="md"><Stack gap="xs"><Text fw={600} size="sm">Sites to teach</Text>{[...new Set(untrained.map(page => page.domain))].map(domain => <Group key={domain} justify="space-between" gap="xs"><Text size="sm">{domain} · {untrained.filter(page => page.domain === domain).length} saved {untrained.filter(page => page.domain === domain).length === 1 ? 'page' : 'pages'}</Text><Button size="xs" variant="light" onClick={() => setTraining(untrained.find(page => page.domain === domain) || null)}>Teach layout</Button></Group>)}</Stack></Paper>}
    {training && <SiteRuleTrainer key={training.sourceUrl} page={training} onSaved={rule => void saveRule(rule)} onCancel={() => setTraining(null)} />}
    <Group justify="space-between" align="center"><div><Title order={2} size="h4">Review queue</Title><Text size="xs" c="dimmed">{posts.filter(post => !post.posted).length} waiting · {posts.filter(post => post.posted).length} published</Text></div>{posts.length > 0 && <Button size="xs" variant="subtle" color="red" onClick={onClear}>Clear queue</Button>}</Group>
    {posts.length ? <div className={styles.grid}>{posts.map(post => <ImportCard key={post.id} post={post} onOpen={() => onOpen(post)} onRemove={() => onRemove(post.id)} />)}</div> : <Paper withBorder radius="md" p="xl"><Text ta="center" size="sm" c="dimmed">No posts in the queue</Text></Paper>}
  </Stack>;
}
