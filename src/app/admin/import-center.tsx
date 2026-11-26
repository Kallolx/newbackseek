'use client';

import { useEffect, useRef, useState } from 'react';
import { Badge, Button, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { FiCheck, FiFileText, FiImage, FiUploadCloud, FiX } from 'react-icons/fi';
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

export function ImportCenter({ posts, onImport, onOpen, onRemove, onClear }: { posts: ImportedPost[]; onImport: (posts: ImportedPost[]) => void; onOpen: (post: ImportedPost) => void; onRemove: (id: string) => void; onClear: () => void }) {
  const [reading, setReading] = useState(false);
  const [skipped, setSkipped] = useState<string[]>([]);
  const filesInput = useRef<HTMLInputElement | null>(null);
  async function importFiles(files: File[]) {
    if (!files.length) return;
    setReading(true);
    try {
      const result = await readSavedPosts(files);
      setSkipped(result.skipped);
      const existing = new Set(posts.map(post => post.id));
      const added = result.posts.filter(post => !existing.has(post.id));
      if (added.length) { onImport(added); toast.success(`${added.length} ${added.length === 1 ? 'post' : 'posts'} added to the review queue.`); }
      else if (result.posts.length) toast.info('These posts are already in the review queue.');
      else toast.warning('No supported post detail pages were found.');
    } catch { toast.error('These saved files could not be read. Try choosing the files again.'); }
    finally { setReading(false); }
  }
  return <Stack gap="lg" className={styles.page}>
    <Paper withBorder radius="md" p={{ base: 'md', sm: 'lg' }}><Stack gap="md">
      <div><Title order={2} size="h4">Import saved posts</Title><Text size="sm" c="dimmed">Add Chrome offline post files together or one at a time. Choose the owner, category and cities for each post when you review it.</Text></div>
      <div className={styles.dropArea}><FiUploadCloud size={24} aria-hidden="true"/><Text fw={600}>Add saved post files</Text><Text size="xs" c="dimmed">Select one or more Chrome offline downloads (.bin or files without an extension). You can add more files to the queue later.</Text><Button size="sm" leftSection={<FiFileText />} loading={reading} onClick={() => filesInput.current?.click()}>{posts.length ? 'Add more files' : 'Choose files'}</Button>
        <input ref={filesInput} type="file" hidden multiple aria-label="Choose saved post files" onChange={event => { void importFiles(Array.from(event.currentTarget.files || [])); event.currentTarget.value = ''; }} />
      </div>
      <Text size="xs" c="dimmed">The queue lasts while this admin tab stays open. Imported posts are never published automatically. Review ownership, age, contact details and images before posting.</Text>
      {skipped.length > 0 && <Paper withBorder p="sm" radius="sm"><Text size="sm" fw={600}>Files needing attention</Text>{skipped.slice(0, 8).map(message => <Text key={message} size="xs" c="dimmed">{message}</Text>)}{skipped.length > 8 && <Text size="xs" c="dimmed">And {skipped.length - 8} more.</Text>}</Paper>}
    </Stack></Paper>
    <Group justify="space-between" align="center"><div><Title order={2} size="h4">Review queue</Title><Text size="xs" c="dimmed">{posts.filter(post => !post.posted).length} waiting · {posts.filter(post => post.posted).length} published</Text></div>{posts.length > 0 && <Button size="xs" variant="subtle" color="red" onClick={onClear}>Clear queue</Button>}</Group>
    {posts.length ? <div className={styles.grid}>{posts.map(post => <ImportCard key={post.id} post={post} onOpen={() => onOpen(post)} onRemove={() => onRemove(post.id)} />)}</div> : <EmptyState kind="search" title="No posts in the queue" description="Choose saved post files to preview them here." />}
  </Stack>;
}
