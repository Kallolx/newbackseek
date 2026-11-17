'use client';

import { FeedbackToast } from '../../components/toast';
import { adminApi } from './live-api';
import { Accordion, Alert, Badge, Button, Checkbox, Group, Modal, NumberInput, Paper, ScrollArea, Select, SimpleGrid, Stack, Stepper, Text, TextInput, Title } from '@mantine/core';
import { AdminPicturePicker } from './picture-picker';
import { useRef, useState } from 'react';
import { FiArrowLeft, FiArrowRight, FiCheck, FiImage, FiMapPin, FiSearch, FiX } from 'react-icons/fi';
import type { Ad, CategoryGroup, LocationCountry } from './admin-data';
import { DescriptionEditor } from '../../member/description-editor';
import { EmptyState } from '../../components/page-state';
import styles from './admin.module.css';

export type PublishRequest = { titles: string[]; description: string; descriptionHtml?: string; category: string; owner: string; targets: string[]; age?: number; location?: string; phone?: string; email?: string; images?: string[]; mediaIds?:string[] };

function CityPicker({ locations, selected, onChange, excluded = [] }: { locations: LocationCountry[]; selected: string[]; onChange: (ids: string[]) => void; excluded?: string[] }) {
  const [code, setCode] = useState(locations[0]?.code ?? '');
  const [region, setRegion] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [confirm, setConfirm] = useState(false);
  const country = locations.find((item) => item.code === code);
  const all = locations.flatMap((country) => country.regions.flatMap((region) => region.cities.map((city) => ({ ...city, country: country.name, region: region.name }))));
  const groups = country?.regions.filter((item) => !region || item.id === region).map((item) => ({ ...item, cities: item.cities.filter((city) => city.name.toLowerCase().includes(search.toLowerCase())) })).filter((item) => item.cities.length) ?? [];
  const matching = groups.flatMap((item) => item.cities).filter((city) => !excluded.includes(city.id));
  const available = all.filter((city) => !excluded.includes(city.id));
  const add = (ids: string[]) => onChange([...new Set([...selected, ...ids])]);
  return <Stack gap="md">
    <Text size="xs" c="dimmed" lh={1.5}>Choose a country and state/region, then select cities. Selections stay saved as you filter.</Text>
    <SimpleGrid cols={{ base: 1, sm: 2 }}><Select label="1. Country" searchable allowDeselect={false} value={code} data={locations.map((item) => ({ value: item.code, label: item.name }))} onChange={(value) => { setCode(value ?? ''); setRegion(null); setSearch(''); }} /><Select label="2. State / region" searchable clearable value={region} placeholder="All states / regions in this country" data={country?.regions.map((item) => ({ value: item.id, label: item.name })) ?? []} onChange={setRegion} /></SimpleGrid>
    <TextInput label="3. Find and select cities" placeholder="Search cities within these filters…" leftSection={<FiSearch />} value={search} onChange={(event) => setSearch(event.currentTarget.value)} />
    <Group justify="space-between"><Text size="xs" c="dimmed">{country?.name} / {country?.regions.find((item) => item.id === region)?.name ?? 'All states and regions'}</Text><Group gap="xs"><Badge>{selected.length} selected</Badge><Button size="compact-xs" variant="subtle" color="red" disabled={!selected.length} onClick={() => onChange([])}>Clear selection</Button></Group></Group>
    <Group grow wrap="nowrap"><Button size="xs" h="auto" mih={42} variant="light" disabled={!matching.length} onClick={() => add(matching.map((item) => item.id))}>Select filtered cities ({matching.length})</Button><Button size="xs" h="auto" mih={42} variant="default" onClick={() => setConfirm(true)}>Select all cities ({available.length})</Button></Group>
    <Stack gap={3}><Text size="xs" c="dimmed"><Text span fw={600}>Filtered:</Text> {country?.name}{region ? ' → ' + country?.regions.find((item) => item.id === region)?.name : ' → all states / regions'}{search.trim() ? ` → cities containing “${search.trim()}”` : ''}.</Text><Text size="xs" c="dimmed"><Text span fw={600}>All cities:</Text> every available city across all {locations.length} countries, regardless of filters.</Text></Stack>
    <ScrollArea.Autosize mah={340} offsetScrollbars>{groups.length ? <Stack gap="sm">{groups.map((item) => {
      const eligible = item.cities.filter((city) => !excluded.includes(city.id));
      const checked = eligible.length > 0 && eligible.every((city) => selected.includes(city.id));
      return <Paper key={item.id} withBorder p="sm" radius="md"><Checkbox disabled={!eligible.length} checked={checked} indeterminate={!checked && eligible.some((city) => selected.includes(city.id))} label={<Text size="sm" fw={600}>{item.name} <Text span c="dimmed" size="xs">· {country?.name}</Text></Text>} onChange={(event) => event.currentTarget.checked ? add(eligible.map((city) => city.id)) : onChange(selected.filter((id) => !eligible.some((city) => city.id === id)))} /><SimpleGrid cols={{ base: 1, xs: 2 }} mt="sm" pl={26}>{item.cities.map((city) => <Checkbox key={city.id} checked={selected.includes(city.id)} disabled={excluded.includes(city.id)} label={city.name + (excluded.includes(city.id) ? ' · already published' : '')} onChange={(event) => event.currentTarget.checked ? add([city.id]) : onChange(selected.filter((id) => id !== city.id))} />)}</SimpleGrid></Paper>;
    })}</Stack> : <EmptyState compact kind="search" title="No matching cities" description="Try a different spelling or choose another state or region." action="Clear filters" onAction={() => { setSearch(''); setRegion(null); }} />}</ScrollArea.Autosize>
    <Accordion variant="contained"><Accordion.Item value="selected"><Accordion.Control icon={<FiMapPin />}>Selected destinations ({selected.length})</Accordion.Control><Accordion.Panel>{!selected.length ? <Text size="sm" c="dimmed">Select cities above to see their country and state here.</Text> : <ScrollArea.Autosize mah={220}><Stack gap="xs">{all.filter((city) => selected.includes(city.id)).map((city) => <Group key={city.id} justify="space-between" wrap="nowrap"><div><Text size="sm">{city.name}</Text><Text size="xs" c="dimmed">{city.region} · {city.country}</Text></div><Button size="compact-xs" variant="subtle" aria-label={'Remove ' + city.name + ', ' + city.region} onClick={() => onChange(selected.filter((id) => id !== city.id))}><FiX /></Button></Group>)}</Stack></ScrollArea.Autosize>}</Accordion.Panel></Accordion.Item></Accordion>
    <Modal opened={confirm} onClose={() => setConfirm(false)} centered title="Select cities across every country?"><Stack><Text size="sm">This selects {available.length} cities across all {locations.length} countries and ignores your filters. Choose “Select filtered cities” to use only the current country, state/region and search.</Text><Group justify="flex-end"><Button variant="default" onClick={() => setConfirm(false)}>Cancel</Button><Button onClick={() => { add(available.map((city) => city.id)); setConfirm(false); }}>Select all cities</Button></Group></Stack></Modal>
  </Stack>;
}

export function Publisher({ locations, categories, source, mode, onSubmit, defaultOwner }: { locations: LocationCountry[]; categories: CategoryGroup[]; source?: Ad; mode: 'create' | 'copy' | 'edit'; onSubmit: (request: PublishRequest) => Promise<void>; defaultOwner?:string }) {
  const [step, setStep] = useState(mode === 'copy' ? 1 : 0);
  const [selected, setSelected] = useState<string[]>(mode === 'edit' ? source?.targets ?? [] : []);
  const [description, setDescription] = useState(source?.description ?? '');
  const [html, setHtml] = useState(source?.descriptionHtml ?? '');
  const [group, setGroup] = useState<string | null>(categories.find((item) => item.services.some((service) => service.slug === source?.category))?.name ?? null);
  const [category, setCategory] = useState<string | null>(source?.category ?? null);
  const [images] = useState<string[]>(source?.images ?? []);
  const [files,setFiles]=useState<File[]>([]);
  const uploaded=useRef(new Map<File,string>());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [review, setReview] = useState<PublishRequest>();
  const form = useRef<HTMLFormElement>(null);
  const all = locations.flatMap((country) => country.regions.flatMap((region) => region.cities.map((city) => ({ ...city, country: country.name, region: region.name }))));
  function draft(): PublishRequest | undefined {
    const fields = new FormData(form.current!);
    if (mode === 'copy') return { ...source!, titles: [source!.title], targets: selected };
    const titles = String(fields.get('titles') ?? '').split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
    const owner = String(fields.get('owner') ?? '').trim();
    if (titles.length !== 1 || titles[0].length < 5 || titles[0].length > 140 || description.trim().length < 20 || description.length > 2950 || !category || !owner) { setError('Add an existing owner username, category, a title of 5–140 characters and a description of 20–2950 characters.'); setStep(0); return; }
    const age = Number(fields.get('age')) || undefined;
    if (age && (age < 18 || age > 120 || !Number.isInteger(age))) { setError('Age must be a whole number between 18 and 120.'); setStep(0); return; }
    const email = String(fields.get('email') ?? '').trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Enter a valid contact email.'); setStep(0); return; }
    return { titles, description, descriptionHtml: html, category, owner, targets: selected, age, location: String(fields.get('location') ?? ''), phone: String(fields.get('phone') ?? ''), email, images };
  }
  function next() {
    setError('');
    const value = draft(); if (!value) return;
    if (step === 0) { setStep(1); return; }
    if (!selected.length) { setError('Select at least one destination city.'); return; }
    setReview(value); setStep(2);
  }
  async function uploadPictures() {
    const ids:string[]=[];
    for (const file of files) {
      const existing=uploaded.current.get(file);if(existing){ids.push(existing);continue;}
      const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('Could not read image'));reader.readAsDataURL(file);});
      const upload=await adminApi<{id:string}>('/admin/media/upload',{method:'POST',body:JSON.stringify({data,contentType:file.type})});
      let ready=false;
      for(let attempt=0;attempt<60;attempt++){
        await new Promise(resolve=>setTimeout(resolve,1000));
        const status=await adminApi<{status:string}>(`/media/${upload.id}`);
        if(status.status==='failed')throw new Error('A picture could not be processed. Please choose another picture.');
        if(status.status==='ready'){ids.push(upload.id);uploaded.current.set(file,upload.id);ready=true;break;}
      }
      if(!ready)throw new Error('A picture is taking longer than expected. Check Media before retrying.');
    }
    return ids;
  }
  return <form ref={form} className={styles.publishFlow} noValidate onSubmit={async(event) => { event.preventDefault(); if (busy) return; if (step === 2 && review) {setBusy(true);setError('');try{const mediaIds=await uploadPictures();await onSubmit({...review,mediaIds});}catch(cause){setError(cause instanceof Error?cause.message:'Unable to save.');}finally{setBusy(false);}} else next(); }}>
    <Stepper active={step} size="sm" mb="lg"><Stepper.Step label="Details" /><Stepper.Step label="Cities" /><Stepper.Step label="Review" /></Stepper>
    <div style={{ display: step === 0 ? undefined : 'none' }}><Paper withBorder p={{ base: 'sm', sm: 'lg' }} radius="md"><Stack gap="md"><div><Title order={3} size="h4">{mode === 'edit' ? 'Edit ad #' + source?.id : 'Create an ad'}</Title><Text size="sm" c="dimmed">Use the same content fields and formatting as the public site.</Text></div>
      <TextInput label="Owner username" name="owner" defaultValue={source?.owner ?? defaultOwner ?? ''} placeholder="Username of an existing account" />
      <TextInput label="Ad title" name="titles" maxLength={150} defaultValue={source?.title} placeholder="Enter a clear headline" />
      <SimpleGrid cols={{ base: 1, sm: 2 }}><Select searchable label="Category group" value={group} placeholder="Choose a category group" data={categories.map((item) => item.name)} onChange={(value) => { setGroup(value); setCategory(null); }} /><Select searchable label="Subcategory" value={category} disabled={!group} placeholder={group ? 'Choose a subcategory' : 'Choose a group first'} data={categories.find((item) => item.name === group)?.services.map((item) => ({ label: item.name, value: item.slug })) ?? []} onChange={setCategory} /></SimpleGrid>
      <div><Text size="sm" fw={500} mb={6}>Description</Text><DescriptionEditor content={source?.descriptionHtml ?? source?.description ?? ''} onChange={(text, value) => { setDescription(text); setHtml(value); }} /></div>
      <SimpleGrid cols={{ base: 1, sm: 2 }}><NumberInput label="Age (when applicable)" name="age" defaultValue={source?.age} min={18} max={120} /><TextInput label="Location / neighborhood" name="location" defaultValue={source?.location} placeholder="Public location text" /><TextInput label="Contact phone" name="phone" defaultValue={source?.phone} placeholder="Phone number" /><TextInput label="Contact email" name="email" type="email" defaultValue={source?.email} placeholder="name@example.com" /></SimpleGrid>
      <AdminPicturePicker files={files} onChange={setFiles} existing={images} disabled={busy}/>
    </Stack></Paper></div>
    <div style={{ display: step === 1 ? undefined : 'none' }}><Paper withBorder p={{ base: 'sm', sm: 'lg' }} radius="md"><Stack><Title order={3} size="h4">Choose destination cities</Title>{mode === 'copy' && <Alert color="blue">Ad #{source?.id}: {source?.title}. Existing destinations are disabled. Pictures are reused rather than duplicated.</Alert>}<CityPicker locations={locations} selected={selected} onChange={setSelected} excluded={mode === 'copy' ? source?.targets : []} /></Stack></Paper></div>
    {step === 2 && review && <Paper withBorder p="lg" radius="md"><Stack gap="md"><Title order={3} size="h4">Review your changes</Title><SimpleGrid cols={3}><div><Text size="xs" c="dimmed">Ads</Text><Text fw={700}>{review.titles.length}</Text></div><div><Text size="xs" c="dimmed">Cities per ad</Text><Text fw={700}>{selected.length}</Text></div><div><Text size="xs" c="dimmed">Placements</Text><Text fw={700}>{selected.length * review.titles.length}</Text></div></SimpleGrid><Text size="sm">Owner: @{review.owner} · {categories.flatMap((item) => item.services).find((item) => item.slug === review.category)?.name}</Text><Paper withBorder p="sm"><Text fw={600} size="sm">{review.titles[0]}</Text><Text size="sm" c="dimmed" lineClamp={3}>{review.description}</Text>{review.titles.length > 1 && <Text size="xs">Plus {review.titles.length - 1} other titles</Text>}</Paper><Text size="sm" fw={600}>Destination cities</Text><ScrollArea.Autosize mah={220}><Stack gap={7}>{all.filter((city) => selected.includes(city.id)).map((city) => <Text size="sm" key={city.id}>{city.name}<Text span size="xs" c="dimmed"> · {city.region} · {city.country}</Text></Text>)}</Stack></ScrollArea.Autosize><Text size="xs" c="dimmed">Changes are saved to the live site after you confirm.</Text></Stack></Paper>}
    <FeedbackToast message={error} />
    <Paper withBorder p="sm" radius="md" mt="md"><Group justify="space-between"><Button variant="default" leftSection={<FiArrowLeft />} disabled={step === 0 || (mode === 'copy' && step === 1)} onClick={() => setStep(step - 1)}>Back</Button><Button type="submit" loading={busy} rightSection={step === 2 ? <FiCheck /> : <FiArrowRight />}>{busy ? 'Submitting…' : step === 0 ? 'Choose cities' : step === 1 ? 'Review changes' : mode === 'edit' ? 'Save changes' : mode === 'copy' ? 'Add destinations' : 'Publish ads'}</Button></Group></Paper>
  </form>;
}
