// Applies supabase/migrations/*.sql in order, once each, inside a transaction.
//
// Run with:  node --env-file=.env scripts/migrate.mjs
// Each file is recorded in schema_migrations, so re-running is a no-op. A file
// that fails rolls back completely and is not recorded, leaving the database on
// the last good migration rather than half-applied.

import {readdir, readFile} from 'node:fs/promises';
import postgres from 'postgres';

const dir = 'supabase/migrations';
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Run with: node --env-file=.env scripts/migrate.mjs');
  process.exit(1);
}

const sql = postgres(url, {prepare: false, max: 1, connect_timeout: 20});

try {
  await sql`create table if not exists schema_migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )`;

  const applied = new Set((await sql`select name from schema_migrations`).map(r => r.name));
  const files = (await readdir(dir)).filter(f => f.endsWith('.sql')).sort();
  let ran = 0;

  for (const file of files) {
    if (applied.has(file)) { console.log(`  skip   ${file}`); continue; }
    const text = await readFile(`${dir}/${file}`, 'utf8');
    try {
      await sql.begin(async tx => {
        await tx.unsafe(text);
        await tx`insert into schema_migrations (name) values (${file})`;
      });
      console.log(`  applied ${file}`);
      ran++;
    } catch (error) {
      console.error(`\n  FAILED ${file} — rolled back, database unchanged\n`);
      console.error(`  ${error.message}`);
      process.exitCode = 1;
      break;
    }
  }

  if (!process.exitCode) {
    const tables = await sql`select tablename from pg_tables where schemaname='public' order by 1`;
    console.log(`\n${ran ? `${ran} migration${ran === 1 ? '' : 's'} applied` : 'Already up to date'}.`);
    console.log(`Tables: ${tables.map(t => t.tablename).join(', ')}`);
  }
} finally {
  await sql.end({timeout: 5});
}
