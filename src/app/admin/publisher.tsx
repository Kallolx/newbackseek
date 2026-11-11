'use client';

import { Alert, Badge, Button, Checkbox, Group, Modal, NativeSelect, Paper, ScrollArea, Stack, Text, Textarea, TextInput, Title } from '@mantine/core';
import { useState, type FormEvent } from 'react';
import type { Ad, CategoryGroup, LocationCountry } from './admin-data';
import styles from './admin.module.css';

export type PublishRequest = {
  titles: string[];
  description: string;
  category: string;
  owner: string;
  targets: string[];
};

export function Publisher({ locations, categories, source, mode, onSubmit }: {
  locations: LocationCountry[];
  categories: CategoryGroup[];
  source?: Ad;
  mode: 'create' | 'bulk' | 'copy' | 'edit';
  onSubmit: (request: PublishRequest) => void;
}) {
  const [countryCode, setCountryCode] = useState(locations[0].code);
  const [regionId, setRegionId] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>(mode === 'edit' ? source?.targets ?? [] : []);
  const [error, setError] = useState('');
  const [review, setReview] = useState<PublishRequest>();
  const country = locations.find(({ code }) => code === countryCode) ?? locations[0];
  const allCities = locations.flatMap(({ regions }) => regions.flatMap(({ cities }) => cities));
  const countryCities = country.regions.flatMap(({ cities }) => cities);
  const regionCities = country.regions.find(({ id }) => id === regionId)?.cities ?? countryCities;
  const visibleCities = regionCities.filter(({ name }) => name.toLowerCase().includes(query.trim().toLowerCase()));
  const selectedIds = new Set(selected);

  function addCities(ids: string[]) {
    setSelected((current) => [...new Set([...current, ...ids])]);
    setError('');
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const original = mode === 'copy' ? source : undefined;
    const titles = original ? [original.title] : String(fields.get('titles') ?? '').split(/\r?\n/).map((title) => title.trim()).filter(Boolean);
    const description = original?.description ?? String(fields.get('description') ?? '').trim();
    const targets = selected.filter((id) => !original?.targets.includes(id));
    if (!titles.length || !description || !targets.length) {
      setError(original ? 'Select at least one city where this ad is not already placed.' : 'Enter a title and description and select at least one city.');
      return;
    }
    setError('');
    setReview({
      titles,
      targets,
      description,
      category: original?.category ?? String(fields.get('category')),
      owner: original?.owner ?? (String(fields.get('owner')).trim() || 'admin'),
    });
  }

  return (
    <form className={styles.publisher} onSubmit={submit}>
      <Paper withBorder radius="md" p="md" component="section">
        <Title order={3} size="h4">1. Ad content</Title>
        <Text size="sm" c="dimmed" mb="md">{mode === 'bulk' ? 'Enter one title per line. All ads in this batch share the description and category.' : 'Set the details that appear on the listing.'}</Text>
        <div className={styles.fields}>
          {mode === 'copy' ? <div><strong>{source?.title}</strong><p>{source?.description}</p></div> : <>
            {mode === 'bulk'
              ? <Textarea label="Ad titles" name="titles" rows={5} required placeholder={'Weekend furniture pickup\nLocal photography sessions'} />
              : <TextInput label="Title" name="titles" defaultValue={source?.title} maxLength={150} required />}
            <Textarea label={mode === 'bulk' ? 'Shared description' : 'Description'} name="description" rows={4} defaultValue={source?.description} required />
            <NativeSelect label="Category" name="category" defaultValue={source?.category ?? ''} required
              data={[
                { value: '', label: 'Select a category', disabled: true },
                ...categories.map(({ name, services }) => ({ group: name, items: services.map(({ name, slug }) => ({ value: slug, label: name })) })),
              ]} />
            <TextInput label="Owner username" name="owner" defaultValue={source?.owner ?? 'admin'} required />
          </>}
        </div>
      </Paper>
      <Paper withBorder radius="md" p="md" component="section">
        <Title order={3} size="h4">2. Choose locations</Title>
        <Text size="sm" c="dimmed" mb="md">Filter by country or region, then select cities. Your selections stay selected when you change filters.</Text>
        <div className={styles.fields}>
          <NativeSelect label="Country" value={countryCode}
            data={locations.map(({ code, name }) => ({ value: code, label: name }))}
            onChange={(event) => { setCountryCode(event.currentTarget.value); setRegionId(''); }} />
          <NativeSelect label="State or region" value={regionId}
            data={[{ value: '', label: 'All regions' }, ...country.regions.map(({ id, name }) => ({ value: id, label: name }))]}
            onChange={(event) => setRegionId(event.currentTarget.value)} />
          <TextInput label="Find a city" type="search" value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search cities" />
        </div>
        <div className={styles.cityActions}>
          <Button variant="light" size="compact-sm" type="button" disabled={!visibleCities.length} onClick={() => addCities(visibleCities.map(({ id }) => id))}>All matching</Button>
          <Button variant="default" size="compact-sm" type="button" onClick={() => addCities(allCities.map(({ id }) => id))}>All city</Button>
        </div>
        <ScrollArea.Autosize mah={190}><div className={styles.cityList}>
          {visibleCities.map(({ name, id }) => (
            <Checkbox key={id} label={name} checked={selectedIds.has(id)} onChange={(event) => {
              if (event.target.checked) addCities([id]);
              else setSelected((current) => current.filter((item) => item !== id));
            }} />
          ))}
          {!visibleCities.length && <p>No matching cities.</p>}
        </div></ScrollArea.Autosize>
        <div className={styles.toolbar}>
          <Badge variant="light">{selected.length} cities selected</Badge>
          <Button variant="subtle" type="button" disabled={!selected.length} onClick={() => setSelected([])}>Clear selection</Button>
        </div>
        {selected.length > 0 && (
          <details>
            <summary>Review selected cities</summary>
            <ul className={styles.cityList}>
              {allCities.filter(({ id }) => selectedIds.has(id)).map(({ id, name }) => (
                <li key={id}>{name} <small>{id.split('/').slice(2, 4).join(' / ')}</small></li>
              ))}
            </ul>
          </details>
        )}
      </Paper>
      <div className={styles.formActions}>
        <Button className={styles.primary} type="submit">{mode === 'edit' ? 'Review changes' : 'Review publication'}</Button>
        {error && <Alert color="red" role="alert">{error}</Alert>}
      </div>
      <Modal opened={Boolean(review)} onClose={() => setReview(undefined)} title={mode === 'edit' ? 'Review changes' : 'Review publication'} centered>
        {review && (
          <Stack gap="md">
            <div>
              <Text fw={600} size="sm">{review.titles[0]}</Text>
              {review.titles.length > 1 && <Text size="xs" c="dimmed">Plus {review.titles.length - 1} more</Text>}
              <Text size="xs" c="dimmed">Posting as @{review.owner}</Text>
            </div>
            <Text size="sm">{review.titles.length} {review.titles.length === 1 ? 'ad' : 'ads'} in {review.targets.length} {review.targets.length === 1 ? 'city' : 'cities'}</Text>
            <ScrollArea.Autosize mah={160}>
              <Stack gap={4}>
                {allCities.filter(({ id }) => review.targets.includes(id)).map(({ id, name }) => (
                  <Text size="sm" key={id}>{name} <Text span c="dimmed" size="xs">{id.split('/').slice(2, 4).join(' / ')}</Text></Text>
                ))}
              </Stack>
            </ScrollArea.Autosize>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setReview(undefined)}>Back to edit</Button>
              <Button onClick={() => onSubmit(review)}>{mode === 'edit' ? 'Save changes' : mode === 'copy' ? 'Distribute ad' : 'Publish'}</Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </form>
  );
}
