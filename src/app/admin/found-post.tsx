'use client';

import Image from 'next/image';
import { Badge, Button, Group, Paper, SegmentedControl, Stack, Text } from '@mantine/core';
import { statusColor } from './admin-data';
import { useState } from 'react';
import { PostCard } from '../../components/post-card';
import type { Ad } from './admin-data';
import styles from './admin.module.css';

export function FoundPost({ ad, images, destinations, onPreview, onBump }: {
  ad: Ad; images: string[]; destinations: string[]; onPreview: (src: string, index: number) => void; onBump?: () => void;
}) {
  const [view, setView] = useState('List');
  return <Paper withBorder p={{ base: 'sm', sm: 'md' }} radius="md"><Stack gap="md">
    <Group justify="space-between"><Text size="sm" fw={600}>Post #{ad.id}</Text><SegmentedControl size="xs" aria-label="Found post view" value={view} onChange={setView} data={['List', 'Gallery']} /></Group>
    <ul className={(view === 'Gallery' ? 'post-list post-gallery ' : 'post-list ') + styles.foundPost}>
      <PostCard title={ad.title} label={destinations.length ? destinations[0] + (destinations.length > 1 ? ` + ${destinations.length - 1} more` : '') : ad.location || 'No city placements'} description={ad.description}
        details={<Group gap="xs"><Text size="xs">@{ad.owner} · {ad.targets.length} {ad.targets.length === 1 ? 'city' : 'cities'}</Text><Badge variant="light" color={statusColor(ad.status)}>{ad.status}</Badge>{ad.bumped&&<Badge variant="outline">Bumped</Badge>}</Group>}
        thumbnail={images[0] ? <button className={styles.cardPhoto} type="button" aria-label={'Preview image for ' + ad.title} onClick={() => onPreview(images[0], 0)}><Image src={images[0]} alt="" fill unoptimized={images[0].startsWith('data:')} sizes={view === 'Gallery' ? '420px' : '140px'} /></button> : undefined} />
    </ul>
    {images.length > 1 && <Group gap={7}>{images.map((src, index) => <button className={styles.foundThumbnail} key={index} type="button" aria-label={'Preview photo ' + (index + 1)} onClick={() => onPreview(src, index)}><Image src={src} alt="" width={56} height={48} unoptimized={src.startsWith('data:')} /></button>)}</Group>}
    {onBump && <Group justify="space-between"><Text size="xs" c="dimmed">{ad.status === 'Published' ? 'Move this post to the top of its current city listings.' : 'Publish this post before bumping it.'}</Text><Button disabled={ad.status !== 'Published'} onClick={onBump}>Bump to top</Button></Group>}
  </Stack></Paper>;
}
