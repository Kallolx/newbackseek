'use client';

import { AreaChart, LineChart } from '@mantine/charts';
import { Badge, Group, Paper, SegmentedControl, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { useState } from 'react';
import { FiActivity, FiClock, FiDatabase, FiGlobe } from 'react-icons/fi';

const hourly = [
  { period: '00:00', Requests: 320, Median: 77, P95: 160 },
  { period: '04:00', Requests: 470, Median: 89, P95: 192 },
  { period: '08:00', Requests: 860, Median: 81, P95: 188 },
  { period: '12:00', Requests: 740, Median: 96, P95: 231 },
  { period: '16:00', Requests: 1230, Median: 85, P95: 203 },
  { period: '20:00', Requests: 1040, Median: 72, P95: 176 },
];

const weekly = [
  { period: 'Thu', Requests: 6100, Median: 82, P95: 201 },
  { period: 'Fri', Requests: 7200, Median: 93, P95: 218 },
  { period: 'Sat', Requests: 9200, Median: 102, P95: 248 },
  { period: 'Sun', Requests: 8500, Median: 89, P95: 213 },
  { period: 'Mon', Requests: 7600, Median: 85, P95: 195 },
  { period: 'Tue', Requests: 8100, Median: 78, P95: 179 },
  { period: 'Wed', Requests: 8400, Median: 72, P95: 176 },
];

const services = [
  { name: 'Public site', state: 'Healthy', latency: '176 ms', metric: '0.12% error rate', icon: FiGlobe },
  { name: 'Database', state: 'Healthy', latency: '18 ms', metric: '38% pool utilization', icon: FiDatabase },
  { name: 'Image CDN', state: 'Healthy', latency: '43 ms', metric: '96.4% cache hit rate', icon: FiActivity },
  { name: 'Image workers', state: 'Watch', latency: '740 ms', metric: '3 queued · 1 failed', icon: FiClock },
];

export function Monitoring({ compact = false }: { compact?: boolean }) {
  const [range, setRange] = useState('24 hours');
  const data = range === '24 hours' ? hourly : weekly;

  return (
    <Stack gap="md" mb="lg">
      <Group justify="space-between">
        <div><Title order={2} size="h4">System telemetry</Title><Text c="dimmed" size="xs">Sample metrics</Text></div>
        <SegmentedControl aria-label="Metric time range" size="xs" value={range} onChange={setRange} data={['24 hours', '7 days']} />
      </Group>
      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <Paper withBorder radius="md" p="md" miw={0}>
          <Group justify="space-between" mb="md"><Title order={3} size="h5">Request traffic</Title><Badge variant="light" color="indigo">Requests</Badge></Group>
          <AreaChart h={220} data={data} dataKey="period" series={[{ name: 'Requests', color: 'indigo.6' }]} curveType="monotone" />
        </Paper>
        <Paper withBorder radius="md" p="md" miw={0}>
          <Group justify="space-between" mb="md"><Title order={3} size="h5">Round trip latency</Title><Badge variant="light" color="teal">Milliseconds</Badge></Group>
          <LineChart h={220} data={data} dataKey="period" series={[{ name: 'Median', color: 'teal.6' }, { name: 'P95', color: 'indigo.6' }]} withLegend unit=" ms" />
        </Paper>
      </SimpleGrid>
      {!compact && <Paper withBorder radius="md" p="md">
        <Title order={3} size="h5" mb="sm">Service health</Title>
        <Table.ScrollContainer minWidth={500}>
          <Table striped highlightOnHover>
            <Table.Thead><Table.Tr><Table.Th>Service</Table.Th><Table.Th>Status</Table.Th><Table.Th>P95 latency</Table.Th><Table.Th>Signal</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>{services.map(({ name, state, latency, metric, icon: Icon }) => (
              <Table.Tr key={name}>
                <Table.Td><Group gap="xs"><Icon />{name}</Group></Table.Td>
                <Table.Td><Badge variant="light" color={state === 'Healthy' ? 'teal' : 'orange'}>{state}</Badge></Table.Td>
                <Table.Td>{latency}</Table.Td><Table.Td>{metric}</Table.Td>
              </Table.Tr>
            ))}</Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>}
    </Stack>
  );
}
