'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { adminRoutes } from './admin-routes';
import { ActionIcon, Alert, AppShell, Avatar, Badge, Box, Breadcrumbs, Burger, Button, Group, Menu, Modal, NativeSelect, NavLink, Paper, ScrollArea, SegmentedControl, SimpleGrid, Stack, Table, Text, TextInput, ThemeIcon, Title } from '@mantine/core';
import { FiActivity, FiBell, FiChevronRight, FiExternalLink, FiFileText, FiFlag, FiGrid, FiImage, FiLogOut, FiMoreHorizontal, FiPlus, FiSearch, FiUsers } from 'react-icons/fi';
import { Monitoring } from './monitoring';
import { PostCard } from '../../components/post-card';
import { useState, type FormEvent } from 'react';
import { adStatuses, initialAds, initialMedia, initialReports, initialUsers } from './admin-data';
import type { Ad, AdStatus, CategoryGroup, LocationCountry } from './admin-data';
import { Publisher, type PublishRequest } from './publisher';
import styles from './admin.module.css';
import { EmptyState } from '../../components/page-state';
import { PostPagination } from '../../components/post-pagination';
import { FoundPost } from './found-post';

const navigation = [
  ['Overview', FiGrid], ['Ads', FiFileText], ['Publish', FiPlus],
  ['Bump post', FiActivity], ['Distribute post', FiGrid], ['Users', FiUsers], ['Media', FiImage], ['Reports', FiFlag], ['System health', FiActivity],
] as const;
type Screen = typeof navigation[number][0];
const pageLabel = (screen: Screen) => screen === 'Ads' ? 'All Ads' : screen === 'Publish' ? 'Ad Publish' : screen;

function RowMenu({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Menu position="bottom-end" width={185} withinPortal>
      <Menu.Target><ActionIcon variant="light" color="gray" size="lg" aria-label={label}><FiMoreHorizontal size={19} /></ActionIcon></Menu.Target>
      <Menu.Dropdown><Menu.Label>Actions</Menu.Label>{children}</Menu.Dropdown>
    </Menu>
  );
}

const dateLabel = () => new Date().toLocaleDateString('en-US', { dateStyle: 'medium' });

export function AdminDashboard({ locations, categories }: { locations: LocationCountry[]; categories: CategoryGroup[] }) {
  const [navigationQuery, setNavigationQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const screen: Screen = (Object.entries(adminRoutes).find(([, path]) => path === pathname)?.[0] as Screen | undefined) ?? 'Overview';
  const [ads, setAds] = useState(initialAds);
  const [users, setUsers] = useState(initialUsers);
  const [reports, setReports] = useState(initialReports);
  const [adView, setAdView] = useState('List');
  const [photo, setPhoto] = useState<(typeof initialMedia)[number]>();
  const [previewUser, setPreviewUser] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [publisherMode, setPublisherMode] = useState<'create' | 'copy' | 'edit'>('create');
  const [source, setSource] = useState<Ad>();
  const [reasonUser, setReasonUser] = useState('');
  const [adPage, setAdPage] = useState(1);
  const [distributionId, setDistributionId] = useState<string | null>(null);
  const [postIdSearch, setPostIdSearch] = useState('');
  const media = ads.flatMap((ad) => ad.images !== undefined ? ad.images.map((src, index) => ({ id: `${ad.id}-${index}`, name: ad.title + ' · Photo ' + (index + 1), src, adId: ad.id })) : initialMedia.filter((image) => image.adId === ad.id));
  const selectedDistribution = ads.find((ad) => String(ad.id) === distributionId);
  const locationLabels = new Map(locations.flatMap((country) => country.regions.flatMap((region) => region.cities.map((city) => [city.id, `${city.name} · ${region.name} · ${country.name}`]))));
  const cityNames = new Map(locations.flatMap(({ regions }) => regions.flatMap(({ cities }) => cities.map(({ id, name }) => [id, name]))));
  const openReports = reports.filter((report) => report.status === 'Open').length;
  function record(action: string) {
    setMessage(action);
  }

  function navigate(next: Screen) {
    router.push(adminRoutes[next]);
    setMenuOpen(false);
    setQuery('');
    setStatus('');
    setAdPage(1);
    setMessage('');
  }
  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => undefined);
    window.location.assign(window.location.hostname.startsWith('admin.') ? '/login' : '/auth');
  }

  function openPublisher(mode: typeof publisherMode, ad?: Ad) {
    setPublisherMode(mode);
    setSource(ad ? { ...ad, images: ad.images ?? initialMedia.filter((image) => image.adId === ad.id).map((image) => image.src) } : undefined);
    if (mode === 'copy' && ad) { setDistributionId(String(ad.id)); setPostIdSearch(String(ad.id)); navigate('Distribute post'); }
    else navigate('Publish');
  }

  function bump(ad: Ad) {
    if (ad.status !== 'Published') {
      setMessage('Only published ads can be bumped.');
      return;
    }
    setAds((items) => [{ ...ad, bumped: true, updated: dateLabel() }, ...items.filter(({ id }) => id !== ad.id)]);
    record(`Bumped ad #${ad.id} to the top.`);
  }

  function changeAdStatus(ad: Ad, next: AdStatus) {
    setAds((items) => items.map((item) => item.id === ad.id ? { ...item, status: next, updated: dateLabel() } : item));
    record(`Ad #${ad.id} moved to ${next.toLowerCase()}.`);
  }

  function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const ad = ads.find(({ id }) => id === Number(fields.get('adId')));
    if (!ad) {
      setMessage('No ad found for that ID.');
      return;
    }
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (submitter instanceof HTMLButtonElement && submitter.value === 'copy') openPublisher('copy', ad);
    else { setDistributionId(String(ad.id)); setPostIdSearch(String(ad.id)); navigate('Bump post'); }
  }

  function submitPublication({ titles, description, category, owner, targets, ...details }: PublishRequest) {
    setAds((items) => {
      if (source && publisherMode === 'edit') {
        return items.map((ad) => ad.id === source.id
          ? { ...ad, ...details, title: titles[0], description, category, owner, targets, updated: dateLabel() }
          : ad);
      }
      if (source && publisherMode === 'copy') {
        return items.map((ad) => ad.id === source.id
          ? { ...ad, targets: [...new Set([...ad.targets, ...targets])], updated: dateLabel() }
          : ad);
      }
      const lastId = Math.max(1000, ...items.map(({ id }) => id));
      return [...titles.map((title, index): Ad => ({
        ...details, id: lastId + index + 1, title, description, category, owner, targets,
        status: 'Published', updated: dateLabel(),
      })), ...items];
    });
    navigate(publisherMode === 'copy' ? 'Distribute post' : 'Ads');
    record(source ? `Updated ad #${source.id}.` : `Published ${titles.length} sample ${titles.length === 1 ? 'ad' : 'ads'}.`);
  }

  function adActions(ad: Ad) {
    return (
      <RowMenu label={`Actions for ad ${ad.id}`}>
        <Menu.Item onClick={() => openPublisher('edit', ad)}>Edit ad</Menu.Item>
        <Menu.Item onClick={() => { setDistributionId(String(ad.id)); setPostIdSearch(String(ad.id)); navigate('Bump post'); }}>Bump post by ID</Menu.Item>
        <Menu.Item onClick={() => openPublisher('copy', ad)}>Distribute post by ID</Menu.Item>
        <Menu.Divider />
        <Menu.Label>Change status</Menu.Label>
        {adStatuses.filter((value) => value !== ad.status).map((value) => (
          <Menu.Item key={value} onClick={() => changeAdStatus(ad, value)}>{value}</Menu.Item>
        ))}
      </RowMenu>
    );
  }

  const filteredAds = ads.filter((ad) =>
    (!status || ad.status === status) && `${ad.id} ${ad.title} ${ad.owner}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div className={styles.admin}>
      <AppShell header={{ height: 64 }} navbar={{ width: 245, breakpoint: 'md', collapsed: { mobile: !menuOpen } }} padding={{ base: 'sm', md: 'xl' }}>
        <AppShell.Header>
          <Group h="100%" px={{ base: 'sm', md: 'lg' }} justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="nowrap">
              <Burger opened={menuOpen} onClick={() => setMenuOpen(!menuOpen)} hiddenFrom="md" size="sm" aria-label="Toggle admin navigation" />
              <Link href="/admin" aria-label="BackpageNew admin">
                <Image className={styles.logo} src="/brand/backpage-new-logo.png" alt="BackpageNew" width={150} height={50} />
              </Link>
              <Breadcrumbs visibleFrom="sm" className={styles.headerCrumbs} separator={<FiChevronRight size={13} />}>
                <Text size="sm" c="dimmed">Administration</Text>
                <Text size="sm" fw={600} truncate>{pageLabel(screen)}</Text>
              </Breadcrumbs>
            </Group>
            <Group gap="xs" wrap="nowrap">
              <Menu position="bottom-end" width={220}>
                <Menu.Target><Button variant="default" px="sm" aria-label="Search admin pages"><FiSearch /><Text ml="xs" visibleFrom="sm" size="sm" c="dimmed">Search workspace</Text></Button></Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>Go to a page</Menu.Label>
                  <TextInput autoFocus aria-label="Find a page" placeholder="Search pages" onChange={(event) => setNavigationQuery(event.currentTarget.value)} />
                  {navigation.filter(([name]) => pageLabel(name).toLowerCase().includes(navigationQuery.toLowerCase())).map(([name, Icon]) =>
                    <Menu.Item key={name} leftSection={<Icon />} onClick={() => { navigate(name); setNavigationQuery(''); }}>{pageLabel(name)}</Menu.Item>
                  )}
                </Menu.Dropdown>
              </Menu>
              <Menu position="bottom-end" width={230}>
                <Menu.Target><ActionIcon variant="light" color="gray" size="lg" aria-label="Notifications"><FiBell /></ActionIcon></Menu.Target>
                <Menu.Dropdown><Menu.Label>Notifications</Menu.Label>
                  <Menu.Item leftSection={<FiFlag />} onClick={() => navigate('Reports')}>{openReports} open reports</Menu.Item>

                </Menu.Dropdown>
              </Menu>
              <Menu position="bottom-end">
                <Menu.Target><Button variant="subtle" color="dark" px={4} leftSection={<Avatar size="sm" color="indigo">AD</Avatar>} aria-label="Administrator menu"><Text visibleFrom="sm" size="sm">Administrator</Text></Button></Menu.Target>
                <Menu.Dropdown><Menu.Label>Administrator</Menu.Label><Menu.Item component="a" href="https://backpagenew.com" leftSection={<FiExternalLink />}>Public site</Menu.Item><Menu.Item color="red" leftSection={<FiLogOut />} onClick={() => void signOut()}>Log out</Menu.Item></Menu.Dropdown>
              </Menu>
            </Group>
          </Group>
        </AppShell.Header>
        <AppShell.Navbar p="sm" className={styles.sidebar}>

          <AppShell.Section grow component={ScrollArea}>
            {navigation.map(([name, Icon]) => (
              <NavLink key={name} label={pageLabel(name)} leftSection={<Icon size={17} />} active={screen === name} onClick={() => { setMenuOpen(false); setQuery(''); setStatus(''); setAdPage(1); setMessage(''); }}
                component={Link} href={adminRoutes[name]} aria-current={screen === name ? 'page' : undefined}
                rightSection={name === 'Reports' && openReports > 0 ? <Badge size="xs" color="orange" variant="light">{openReports}</Badge> : undefined} />
            ))}
          </AppShell.Section>
          <Button component="a" href="https://backpagenew.com" variant="white" color="dark" leftSection={<FiExternalLink />}>View public site</Button>
        </AppShell.Navbar>
        <AppShell.Main id="main">
          <Box className={styles.content}>
          {previewUser && <div className={styles.feedback}>Previewing member access for @{previewUser} · {ads.filter((ad) => ad.owner === previewUser).length} owned ads
            <Button type="button" onClick={() => { record(`Ended user preview for @${previewUser}.`); setPreviewUser(''); }}>End preview</Button>
          </div>}
          <div className={styles.heading}>
            <div><h1>{pageLabel(screen)}</h1><p>{screen === 'Overview' ? 'Manage listings, accounts, and media across all markets.' : screen === 'Publish' ? 'Prepare ads and choose where they should appear.' : ''}</p></div>
            {(screen === 'Overview' || screen === 'Ads') && <Button className={styles.primary} leftSection={<FiPlus size={15} />} type="button" onClick={() => openPublisher('create')}>Create ad</Button>}
          </div>
          {message && <Alert role="status" color="indigo" mb="md" withCloseButton onClose={() => setMessage('')}>{message}</Alert>}

          {screen === 'Overview' && <>
            <SimpleGrid cols={{ base: 2, lg: 4 }} spacing="sm" mb="lg">
              {[
                { label: 'Published ads', count: ads.filter((ad) => ad.status === 'Published').length, destination: 'Ads', icon: FiFileText, color: 'indigo' },
                { label: 'Member accounts', count: users.length, destination: 'Users', icon: FiUsers, color: 'cyan' },
                { label: 'Media assets', count: initialMedia.length, destination: 'Media', icon: FiImage, color: 'violet' },
                { label: 'Open reports', count: openReports, destination: 'Reports', icon: FiFlag, color: 'orange' },
              ].map(({ label, count, destination, icon: Icon, color }) => (
                <Paper component="button" type="button" key={label} withBorder p="md" radius="md" className={styles.stat} onClick={() => navigate(destination as Screen)}>
                  <Group justify="space-between" gap="xs"><Text size="sm" c="dimmed">{label}</Text><ThemeIcon color={color} variant="light"><Icon /></ThemeIcon></Group>
                  <Title order={2} my={4}>{count}</Title>
                </Paper>
              ))}
            </SimpleGrid>
            <Monitoring compact />
            <Paper withBorder radius="md" p="md" mb="md" component="section">
              <Title order={3} size="h4" mb="xs">Quick ad actions</Title>
              <p>Use an ad ID to bump a published ad or distribute an existing ad to more cities.</p>
              <form className={styles.toolbar} onSubmit={lookup}>
                <TextInput aria-label="Ad ID" name="adId" type="number" min="1" placeholder="Ad ID, e.g. 1001" required />
                <Button type="submit" value="bump">Bump ad</Button>
                <Button type="submit" value="copy">Distribute ad</Button>
              </form>
            </Paper>
          </>}

          {screen === 'System health' && <Monitoring />}

          {screen === 'Ads' && <Paper withBorder radius="md" p="md" mb="md" component="section">
            <div className={styles.toolbar}>
              <TextInput className={styles.search} leftSection={<FiSearch size={15} />} type="search" aria-label="Search ads"
                placeholder="Search ID, title, or owner" value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
              <NativeSelect aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="">All statuses</option>{adStatuses.map((item) => <option key={item}>{item}</option>)}
              </NativeSelect>
              <SegmentedControl aria-label="Ad view" value={adView} onChange={setAdView} data={['List', 'Gallery']} />
            </div>
            <ul className={adView === 'Gallery' ? 'post-list post-gallery' : 'post-list'}>
              {filteredAds.slice((Math.min(adPage, Math.max(1, Math.ceil(filteredAds.length / 50))) - 1) * 50, Math.min(adPage, Math.max(1, Math.ceil(filteredAds.length / 50))) * 50).map((ad) => {
                const image = media.find(({ adId }) => adId === ad.id);
                const location = ad.targets.length === 1 ? cityNames.get(ad.targets[0]) : `${ad.targets.length} cities`;
                return (
                  <PostCard
                    key={ad.id}
                    title={ad.title}
                    label={location ?? 'Location unavailable'}
                    description={ad.description}
                    details={`#${ad.id} · @${ad.owner} · ${ad.status}${ad.bumped ? ' · Bumped' : ''}`}
                    actions={adActions(ad)}
                    thumbnail={image && (
                      <button className={styles.cardPhoto} type="button" aria-label={'Preview image for ' + ad.title} onClick={() => setPhoto(image)}>
                        <Image src={image.src} alt="" fill sizes={adView === 'Gallery' ? '(max-width: 768px) 100vw, 360px' : '140px'} />
                      </button>
                    )}
                  />
                );
              })}
            </ul>
            {!filteredAds.length ? <EmptyState kind="search" title="No matching ads" description="Search by ad ID, title or owner, or reset your filters to see all ads." action="Reset filters" onAction={() => { setQuery(''); setStatus(''); setAdPage(1); }} /> : <PostPagination page={Math.min(adPage, Math.ceil(filteredAds.length / 50))} total={Math.ceil(filteredAds.length / 50)} onChange={setAdPage} />}
          </Paper>}

          {screen === 'Publish' && <>
            <div className={styles.toolbar}>
              {source ? <Group gap="sm">
                <Button variant="default" onClick={() => navigate('Ads')}>Back to ads</Button>
                <Badge variant="light">{publisherMode === 'copy' ? 'Distributing' : 'Editing'} ad #{source.id}</Badge>
              </Group> : <Text size="sm" c="dimmed">Create one ad and choose the cities where it should appear.</Text>}
            </div>
            <Publisher key={publisherMode + (source?.id ?? '')} locations={locations} categories={categories} mode={publisherMode} source={source} onSubmit={submitPublication} />
          </>}

          {(screen === 'Bump post' || screen === 'Distribute post') && <Stack>
            <Paper withBorder p="md" radius="md"><Stack><Title order={3} size="h4">Find a post by ID</Title><Text size="sm" c="dimmed">{screen === 'Bump post' ? 'Search for a published post to move it to the top of its city listings.' : 'Search for an existing post to add destination cities.'}</Text>
              <form onSubmit={(event) => { event.preventDefault(); const found = ads.find((ad) => ad.id === Number(postIdSearch)); setDistributionId(found ? String(found.id) : null); setSource(found); setPublisherMode('copy'); setMessage(found ? '' : 'No post found for that ID. Check the number and try again.'); }}><Group align="end"><TextInput style={{ flex: 1 }} label="Post ID" placeholder="Enter Post ID, e.g. 1001" inputMode="numeric" value={postIdSearch} onChange={(event) => { setPostIdSearch(event.currentTarget.value); setDistributionId(null); }} required /><Button type="submit" leftSection={<FiSearch />}>Find post</Button></Group></form>
            </Stack></Paper>
            {selectedDistribution ? <><FoundPost ad={selectedDistribution} images={media.filter((image) => image.adId === selectedDistribution.id).map((image) => image.src)} destinations={selectedDistribution.targets.map((target) => locationLabels.get(target) ?? target)} onPreview={(src, index) => setPhoto({ id: `${selectedDistribution.id}-${index}`, name: selectedDistribution.title, src, adId: selectedDistribution.id })} onBump={screen === 'Bump post' ? () => bump(selectedDistribution) : undefined} />{screen === 'Distribute post' && <Publisher key={selectedDistribution.id + selectedDistribution.targets.join(',')} locations={locations} categories={categories} mode="copy" source={selectedDistribution} onSubmit={(request) => { setAds((items) => items.map((ad) => ad.id === selectedDistribution.id ? { ...ad, targets: [...new Set([...ad.targets, ...request.targets])], updated: dateLabel() } : ad)); record(`Added ${request.targets.length} destinations to post #${selectedDistribution.id} in this preview.`); }} />}</> : <EmptyState kind="search" title={screen === 'Bump post' ? 'Find a post to bump' : 'Find a post to distribute'} description="Enter its numeric Post ID above to load the post and review its current cities." />}
          </Stack>}


          {screen === 'Users' && <Paper withBorder radius="md" p="md" mb="md" component="section">
            <div className={styles.toolbar}>
              <TextInput className={styles.search} leftSection={<FiSearch size={15} />} type="search" aria-label="Search users"
                placeholder="Search name, email, or username" value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
            </div>
            <Table className={styles.responsiveTable} striped highlightOnHover verticalSpacing="sm">
              <Table.Thead><Table.Tr><Table.Th>Account</Table.Th><Table.Th>Role</Table.Th><Table.Th>Status</Table.Th><Table.Th>Actions</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>{users.filter((user) => `${user.id} ${user.name} ${user.email}`.toLowerCase().includes(query.trim().toLowerCase())).map((user) => (
                <Table.Tr key={user.id}>
                  <Table.Td data-label="Account"><Group gap="sm" wrap="nowrap"><Avatar radius="xl" color="indigo">{user.name.split(' ').map((name) => name[0]).join('')}</Avatar><Box><strong>{user.name}</strong><small>@{user.id} · {user.email}</small></Box></Group></Table.Td><Table.Td data-label="Role">{user.role}</Table.Td><Table.Td data-label="Status"><Badge variant="light" color={user.status === 'Active' ? 'teal' : 'orange'}>{user.status}</Badge></Table.Td>
                  <Table.Td data-label="Actions"><RowMenu label={`Actions for ${user.name}`}>
                    <Menu.Item onClick={() => { navigate('Ads'); setQuery(user.id); }}>View ads</Menu.Item>
                    <Menu.Item onClick={() => {
                      const next = user.status === 'Active' ? 'Suspended' : 'Active';
                      setUsers((items) => items.map((item) => item.id === user.id ? { ...item, status: next } : item));
                      record(`@${user.id} moved to ${next.toLowerCase()}.`);
                    }}>{user.status === 'Active' ? 'Suspend' : 'Restore'}</Menu.Item>
                    <Menu.Item disabled={Boolean(previewUser)} onClick={() => setReasonUser(user.id)}>Impersonate</Menu.Item>
                  </RowMenu></Table.Td>
                </Table.Tr>
              ))}</Table.Tbody>
            </Table>
            {reasonUser && <form className={styles.feedback} onSubmit={(event) => {
              event.preventDefault();
              const reason = String(new FormData(event.currentTarget).get('reason')).trim();
              if (!reason) return;
              setPreviewUser(reasonUser);
              record(`Started user preview for @${reasonUser}. Reason: ${reason}`);
              setReasonUser('');
            }}>
              <label>Reason for previewing @{reasonUser}<TextInput name="reason" required placeholder="Support case or investigation" /></label>
              <Button type="submit">Start demo preview</Button>
              <Button type="button" onClick={() => setReasonUser('')}>Cancel</Button>
            </form>}
          </Paper>}

          {screen === 'Media' && <Paper withBorder radius="md" p="md" mb="md" component="section">
              <Text size="sm" c="dimmed">Browse pictures attached to ads, including new uploads. Select a picture to inspect it. Image resizing and delivery will be managed automatically by the server.</Text>
            <div className={styles.toolbar}>
              <TextInput className={styles.search} leftSection={<FiSearch size={15} />} type="search" aria-label="Search images"
                placeholder="Search images by name or ad ID" value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
            </div>
            <SimpleGrid cols={{ base: 1, xs: 2, xl: 3 }}>
              {media.filter(({ name, adId }) => `${name} ${adId}`.toLowerCase().includes(query.trim().toLowerCase())).map((image) => (
                <Paper withBorder p="sm" key={image.id}>
                  <ActionIcon className={styles.galleryPhoto} variant="light" color="gray" aria-label={'Preview ' + image.name} onClick={() => setPhoto(image)}>
                    <Image src={image.src} alt="" fill sizes="(max-width: 768px) 100vw, 360px" />
                  </ActionIcon>
                  <Text size="sm" fw={600} mt="xs">{image.name}</Text>
                  <Text size="xs" c="dimmed">Ad #{image.adId}</Text>
                </Paper>
              ))}
            </SimpleGrid>
            {!media.some(({ name, adId }) => `${name} ${adId}`.toLowerCase().includes(query.trim().toLowerCase())) && <EmptyState kind="photo" title="No pictures found" description="Images added through the ad editor appear here automatically. Try a different search." action="Clear search" onAction={() => setQuery('')} />}
          </Paper>}

          {screen === 'Reports' && <Paper withBorder radius="md" p="md" mb="md" component="section">
            <Title order={3} size="h4" mb="xs">Ad reports</Title>
            <Table className={styles.responsiveTable} striped highlightOnHover verticalSpacing="sm">
              <Table.Thead><Table.Tr><Table.Th>Report</Table.Th><Table.Th>Ad</Table.Th><Table.Th>Reason</Table.Th><Table.Th>Status</Table.Th><Table.Th>Actions</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>{reports.map((report) => <Table.Tr key={report.id}>
                <Table.Td data-label="Report">{report.id}</Table.Td><Table.Td data-label="Ad"><Button type="button" onClick={() => { navigate('Ads'); setQuery(String(report.adId)); }}>#{report.adId}</Button></Table.Td>
                <Table.Td data-label="Reason">{report.reason}</Table.Td><Table.Td data-label="Status">{report.status}</Table.Td>
                <Table.Td data-label="Actions"><RowMenu label={`Actions for ${report.id}`}>
                  {['Dismissed', 'Ad paused'].map((next) => <Menu.Item key={next} disabled={report.status !== 'Open'} onClick={() => {
                    if (next === 'Ad paused') setAds((items) => items.map((ad) => ad.id === report.adId ? { ...ad, status: 'Paused', updated: dateLabel() } : ad));
                    setReports((items) => items.map((item) => item.id === report.id ? { ...item, status: next } : item));
                    record(`Report ${report.id} resolved: ${next.toLowerCase()}.`);
                  }}>{next === 'Dismissed' ? 'Dismiss' : 'Pause ad'}</Menu.Item>)}
                </RowMenu></Table.Td>
              </Table.Tr>)}</Table.Tbody>
            </Table>
          </Paper>}

          <Modal opened={Boolean(photo)} onClose={() => setPhoto(undefined)} title={photo?.name} size="lg" centered>
            {photo && <Image className={styles.previewPhoto} src={photo.src} alt={photo.name} width={600} height={400} />}
          </Modal>
          </Box>
        </AppShell.Main>
      </AppShell>
    </div>
  );
}
