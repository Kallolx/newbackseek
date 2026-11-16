import { readFile } from 'node:fs/promises';
import { sql } from './db.mjs';
const locations=JSON.parse(await readFile(new URL('../../src/directory/reference-locations.json',import.meta.url),'utf8'));
const {serviceGroups}=await import('../../src/directory/service-groups.ts');
const slug=name=>name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
try {
 await sql.begin(async tx=>{
   for(const country of locations) for(const region of country.regions) for(const city of region.cities) {
     await tx`insert into cities (country_code,country,region,name,href) values (${country.code},${country.name},${region.name},${city.name},${'/browse/'+country.code+'/'+slug(region.name)+'/'+slug(city.name)}) on conflict (href) do nothing`;
   }
   for(const group of serviceGroups) for(const service of group.services)
     await tx`insert into categories (slug,name,group_name) values (${service.slug},${service.name},${group.name}) on conflict (slug) do update set name=excluded.name,group_name=excluded.group_name`;
 });
 console.log('Directory imported');
} finally {await sql.end();}
