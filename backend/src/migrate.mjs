import { readFile, readdir } from 'node:fs/promises';
import { sql } from './db.mjs';
try {
  await sql.begin(async tx => {
    await tx`select pg_advisory_xact_lock(734291)`;
    await tx`create table if not exists migrations (name text primary key, applied_at timestamptz default now())`;
    for (const name of (await readdir(new URL('../migrations/', import.meta.url))).filter(n => n.endsWith('.sql')).sort()) {
      if ((await tx`select name from migrations where name=${name}`).length) continue;
      await tx.unsafe(await readFile(new URL('../migrations/' + name, import.meta.url), 'utf8'));
      await tx`insert into migrations (name) values (${name})`;
      console.log('Applied', name);
    }
  });
} finally { await sql.end(); }
