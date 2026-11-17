'use client';
import { useEffect,useState } from 'react';
import { Badge,Button,Group,Paper,SimpleGrid,Skeleton,Stack,Text,Title } from '@mantine/core';
import { LineChart } from '@mantine/charts';
import { useAdminResource } from './live-api';
import { EmptyState } from '../../components/page-state';
type Health={databaseMs:number;queue:{waiting:number;active:number;failed:number};uptime:number;memory:{rss:number};telemetry:{requests:number;errors:number;startedAt:string;p95:number}};
export function Monitoring({compact=false}:{compact?:boolean}){
 const {data,loading,error,reload}=useAdminResource<Health>('/admin/health/system');
 const [points,setPoints]=useState<{time:string;Database:number;API:number}[]>([]);
 useEffect(()=>{const timer=setInterval(reload,15000);return()=>clearInterval(timer);},[reload]);
 useEffect(()=>{if(data)setPoints(items=>[...items.slice(-29),{time:new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'}),Database:Math.round(data.databaseMs),API:Math.round(data.telemetry.p95)}]);},[data]);
 if(!data&&loading)return <SimpleGrid cols={{base:2,md:4}}>{[0,1,2,3].map(i=><Skeleton key={i} height={95} radius="md"/>)}</SimpleGrid>;
 if(error)return <EmptyState title="Health check failed" description="Live metrics could not be retrieved." action="Retry" onAction={reload}/>;
 return <Stack><Group justify="space-between"><div><Title order={2} size="h4">Live system health</Title><Text size="xs" c="dimmed">Refreshes every 15 seconds · measurements since API startup</Text></div><Badge color="teal" variant="light">Connected</Badge></Group><SimpleGrid cols={{base:2,md:4}}>{[['Database response',`${data?.databaseMs.toFixed(1)} ms`],['API memory',`${Math.round((data?.memory.rss||0)/1048576)} MB`],['Queued images',data?.queue.waiting||0],['Failed images',data?.queue.failed||0]].map(([name,value])=><Paper key={name} withBorder p="md" radius="md"><Text size="xs" c="dimmed">{name}</Text><Text fw={700} size="xl">{value}</Text></Paper>)}</SimpleGrid>{!compact&&<><Paper withBorder p="md" radius="md"><Title order={3} size="h5" mb="xs">Observed response times</Title><Text size="xs" c="dimmed" mb="md">API P95 uses up to 500 recent requests. Chart points are collected while this page is open.</Text>{points.length<2?<Text size="sm" c="dimmed" py="xl">Collecting the next measurement…</Text>:<LineChart h={220} data={points} dataKey="time" series={[{name:'Database',color:'teal.6'},{name:'API',color:'indigo.6'}]} withLegend unit=" ms"/>}</Paper><Paper withBorder p="md" radius="md"><SimpleGrid cols={{base:2,md:4}}>{[['Observed requests',data?.telemetry.requests],['Server errors',data?.telemetry.errors],['Active image jobs',data?.queue.active],['API uptime',`${Math.floor((data?.uptime||0)/60)} minutes`]].map(([name,value])=><div key={String(name)}><Text size="xs" c="dimmed">{name}</Text><Text fw={600}>{value}</Text></div>)}</SimpleGrid><Text size="xs" c="dimmed" mt="md">Cloudflare traffic, cache hit rates and CDN latency are available in your Cloudflare dashboard.</Text></Paper></>}</Stack>;
}
