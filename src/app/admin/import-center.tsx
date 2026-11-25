'use client';

import { useEffect, useRef, useState } from 'react';
import { Badge, Button, Group, Paper, Select, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core';
import { FiCheck, FiFileText, FiFolder, FiImage, FiUploadCloud, FiX } from 'react-icons/fi';
import type { CategoryGroup, LocationCountry } from './admin-data';
import { readSavedPosts, type ImportedPost } from './saved-post-import';
import { toast } from '../../components/toast';
import { EmptyState } from '../../components/page-state';
import styles from './import-center.module.css';

function ImportCard({ post, onOpen, onRemove }: { post: ImportedPost; onOpen: () => void; onRemove: () => void }) {
  const [cover, setCover] = useState('');
  useEffect(() => {
    const url = post.pictures[0] ? URL.createObjectURL(post.pictures[0]) : '';
    const frame = requestAnimationFrame(() => setCover(url));
    return () => { cancelAnimationFrame(frame); if (url) URL.revokeObjectURL(url); };
  }, [post.pictures]);
  return <Paper withBorder radius="md" className={styles.card}>
    <div className={styles.cover}>{cover ? <img src={cover} alt="" loading="lazy" /> : <FiImage aria-hidden="true" size={30} />}</div>
    <div className={styles.cardBody}>
      <Group gap="xs" wrap="wrap"><Badge variant="light" color="indigo">{post.sourceName}</Badge><Badge variant="light" color={post.posted ? 'teal' : post.warnings.length ? 'orange' : 'blue'}>{post.posted ? 'Published' : post.warnings.length ? 'Review needed' : 'Ready to review'}</Badge><Text size="xs" c="dimmed">{post.pictures.length} pictures</Text></Group>
      <Text fw={700} size="sm" lineClamp={2}>{post.title || 'Untitled post'}</Text>
      <Text size="xs" c="dimmed" lineClamp={2}>{post.description || 'No description found.'}</Text>
      {post.warnings.length > 0 && !post.posted && <Text size="xs" c="orange.8">{post.warnings.join(' · ')}</Text>}
      <Group gap="xs" mt="auto"><Button size="xs" leftSection={post.posted ? <FiCheck /> : <FiFileText />} disabled={post.posted} onClick={onOpen}>Review in Ad Publish</Button><Button size="xs" variant="subtle" color="red" leftSection={<FiX />} onClick={onRemove}>Remove</Button></Group>
    </div>
  </Paper>;
}

export function ImportCenter({ locations, categories, defaultOwner, posts, onImport, onOpen, onRemove, onClear }: { locations: LocationCountry[]; categories: CategoryGroup[]; defaultOwner: string; posts: ImportedPost[]; onImport: (posts: ImportedPost[]) => void; onOpen: (post: ImportedPost) => void; onRemove: (id: string) => void; onClear: () => void }) {
  const [owner, setOwner] = useState(defaultOwner);
  const [country, setCountry] = useState(locations[0]?.code || '');
  const [region, setRegion] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [group, setGroup] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [skipped, setSkipped] = useState<string[]>([]);
  const folderInput = useRef<HTMLInputElement | null>(null);
  const filesInput = useRef<HTMLInputElement | null>(null);
  const currentCountry = locations.find(item => item.code === country);
  const currentRegion = currentCountry?.regions.find(item => item.id === region);
  async function importFiles(files: File[]) {
    if (!files.length) return;
    if (!owner.trim() || !city || !category) { toast.warning('Choose an owner, destination city and category first.'); return; }
    setReading(true);
    try {
      const result = await readSavedPosts(files, { owner: owner.trim(), category, targets: [city] });
      setSkipped(result.skipped);
      if (result.posts.length) { onImport(result.posts); toast.success(`${result.posts.length} posts added to the review queue.`); }
      else toast.warning('No supported post detail pages were found.');
    } catch { toast.error('These saved files could not be read. Try choosing the folder again.'); }
    finally { setReading(false); }
  }
  return <Stack gap="lg" className={styles.page}>
    <Paper withBorder radius="md" p={{ base: 'md', sm: 'lg' }}><Stack gap="md">
      <div><Title order={2} size="h4">Import saved posts</Title><Text size="sm" c="dimmed">Choose the destination once, then load saved post pages and their picture folders. Each post stays local until you publish it.</Text></div>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <TextInput label="Post owner username" value={owner} onChange={event => setOwner(event.currentTarget.value)} placeholder="Existing account username" />
        <Select label="Country" searchable value={country} data={locations.map(item => ({ value: item.code, label: item.name }))} onChange={value => { setCountry(value || ''); setRegion(null); setCity(null); }} />
        <Select label="State / region" searchable value={region} placeholder="Choose a state or region" data={currentCountry?.regions.map(item => ({ value: item.id, label: item.name })) || []} onChange={value => { setRegion(value); setCity(null); }} />
        <Select label="City" searchable value={city} disabled={!region} placeholder="Choose a city" data={currentRegion?.cities.map(item => ({ value: item.id, label: item.name })) || []} onChange={setCity} />
        <Select label="Category group" searchable value={group} placeholder="Choose a group" data={categories.map(item => item.name)} onChange={value => { setGroup(value); setCategory(null); }} />
        <Select label="Subcategory" searchable value={category} disabled={!group} placeholder="Choose a subcategory" data={categories.find(item => item.name === group)?.services.map(item => ({ value: item.slug, label: item.name })) || []} onChange={setCategory} />
      </SimpleGrid>
      <div className={styles.dropArea}><FiUploadCloud size={24} aria-hidden="true"/><Text fw={600}>Select saved post pages</Text><Text size="xs" c="dimmed">For full picture import, put the HTML files and their “_files” folders inside one folder, then choose that folder. On phones, you can select HTML and image files together.</Text><Group justify="center" gap="xs"><Button size="sm" leftSection={<FiFolder />} loading={reading} onClick={() => folderInput.current?.click()}>Choose folder</Button><Button size="sm" variant="light" leftSection={<FiFileText />} disabled={reading} onClick={() => filesInput.current?.click()}>Choose files</Button></Group>
        <input ref={node => { folderInput.current = node; node?.setAttribute('webkitdirectory', ''); }} type="file" hidden aria-label="Choose a folder of saved posts" onChange={event => { void importFiles(Array.from(event.currentTarget.files || [])); event.currentTarget.value = ''; }} />
        <input ref={filesInput} type="file" hidden multiple accept=".html,.htm,image/jpeg,image/png,image/webp" aria-label="Choose saved HTML and image files" onChange={event => { void importFiles(Array.from(event.currentTarget.files || [])); event.currentTarget.value = ''; }} />
      </div>
      <Text size="xs" c="dimmed">The queue lasts while this admin tab stays open. Imported posts are never published automatically. Review ownership, age, contact details and images before posting.</Text>
      {skipped.length > 0 && <Paper withBorder p="sm" radius="sm"><Text size="sm" fw={600}>Files needing attention</Text>{skipped.slice(0, 8).map(message => <Text key={message} size="xs" c="dimmed">{message}</Text>)}{skipped.length > 8 && <Text size="xs" c="dimmed">And {skipped.length - 8} more.</Text>}</Paper>}
    </Stack></Paper>
    <Group justify="space-between" align="center"><div><Title order={2} size="h4">Review queue</Title><Text size="xs" c="dimmed">{posts.filter(post => !post.posted).length} waiting · {posts.filter(post => post.posted).length} published</Text></div>{posts.length > 0 && <Button size="xs" variant="subtle" color="red" onClick={onClear}>Clear queue</Button>}</Group>
    {posts.length ? <div className={styles.grid}>{posts.map(post => <ImportCard key={post.id} post={post} onOpen={() => onOpen(post)} onRemove={() => onRemove(post.id)} />)}</div> : <EmptyState kind="search" title="No posts in the queue" description="Choose saved post HTML files and their picture folders to preview posts here." />}
  </Stack>;
}
