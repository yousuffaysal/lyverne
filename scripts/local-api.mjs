// Local preview API.
//
// The preview now runs the same auth path as production: it signs test
// identities into the real Supabase project and hands the Worker a genuine
// JWT. Nothing here fabricates identity, so a bug in the local shim can no
// longer hide a hole in the deployed authentication.
//
// Data still lives in a local SQLite file by default, so preview activity does
// not touch the production tables. Set LYVERNE_PREVIEW_DB=supabase to run the
// preview against Supabase Postgres instead.

import worker from '../server/worker.mjs';
import {localDatabase} from './local-database.mjs';
import {createDatabase} from '../server/db.mjs';
import {mkdir, readFile, writeFile} from 'node:fs/promises';

// Load .env here rather than requiring a --env-file flag, so `npm run dev`
// keeps working unchanged. Values already in the environment win.
try { process.loadEnvFile('.env'); } catch { /* no .env: preview runs unauthenticated */ }

const previewData = process.env.LYVERNE_PREVIEW_DATA_DIR || '.preview';
await mkdir(previewData + '/uploads', {recursive: true});

const useSupabase = process.env.LYVERNE_PREVIEW_DB === 'supabase';
const DB = useSupabase
  ? createDatabase(process.env.DATABASE_URL, {max: Number(process.env.DB_POOL_MAX) || 5})
  : await localDatabase(previewData + '/store.sqlite');
if (useSupabase) console.log('Preview database: Supabase Postgres');

// Stands in for the platform's static-asset binding so the Worker can read the
// built page shells (it rewrites /collection/ from public/collection/index.html).
const ASSETS = {
  async fetch(request) {
    const path = new URL(request.url).pathname;
    const file = 'public' + (path.endsWith('/') ? path + 'index.html' : path);
    try {
      return new Response(await readFile(file), {headers: {'Content-Type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream'}});
    } catch {
      return new Response('Not found', {status: 404});
    }
  },
};

const env = {
  DB,
  ASSETS,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
  ADMIN_EMAIL: process.env.ADMIN_EMAIL,
  SITE_ORIGIN: process.env.SITE_ORIGIN,
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  AI_API_KEY: process.env.AI_API_KEY,
  AI_BASE_URL: process.env.AI_BASE_URL,
  AI_MODEL: process.env.AI_MODEL,
  BUCKET: {
    async put(key, buffer) { await writeFile(previewData + '/uploads/' + key, Buffer.from(buffer)); },
    async get(key) {
      try {
        return {
          body: await readFile(previewData + '/uploads/' + key),
          httpMetadata: {contentType: key.endsWith('png') ? 'image/png' : key.endsWith('jpeg') ? 'image/jpeg' : 'image/webp'},
        };
      } catch { return null; }
    },
  },
};

const SB = process.env.SUPABASE_URL;
const SECRET = process.env.SUPABASE_SECRET_KEY;
const PUBLISHABLE = process.env.SUPABASE_PUBLISHABLE_KEY;
const configured = !!(SB && SECRET && PUBLISHABLE);


const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/workspace.css"><title>${title} — Lyverne</title></head><body><main class="initial-panel">${body}</main></body></html>`;

export async function localApi(req, res) {
  const origin = 'http://127.0.0.1:' + (process.env.LYVERNE_PORT || 4173);
  const url = new URL(req.url, origin);
  const safeReturn = t => (t && t.startsWith('/') && !t.startsWith('//') ? t : '/dashboard/');

  // The preview signs in through the real Supabase endpoints, exactly as the
  // deployed site does. The former /signin-with-chatgpt test-identity shim is
  // gone: a second, weaker auth path in development is how a hole in the real
  // one goes unnoticed.

  // Routes the Worker owns. /collection/ itself stays static (it is generated
  // at build time); only /collection/<slug>/ product pages are rendered live.
  const workerRoutes = url.pathname.startsWith('/api/')
    || url.pathname.startsWith('/media/')
    || url.pathname === '/robots.txt'
    || url.pathname === '/sitemap.xml'
    || url.pathname === '/collection/'
    || /^\/collection\/[a-z0-9][a-z0-9-]*\/?$/.test(url.pathname);
  if (!workerRoutes) return false;

  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    // Strip the legacy trusted headers: the Worker ignores them now, and
    // dropping them keeps the preview honest about how identity is proven.
    if (!k.toLowerCase().startsWith('oai-')) headers.set(k, Array.isArray(v) ? v.join(',') : v);
  }

  let payload;
  if (!['GET', 'HEAD'].includes(req.method)) {
    const chunks = [];
    let length = 0;
    for await (const chunk of req) {
      length += chunk.length;
      if (length > 5 * 1024 * 1024) { res.writeHead(413).end('Too large'); return true; }
      chunks.push(chunk);
    }
    payload = Buffer.concat(chunks);
  }

  const response = await worker.fetch(new Request(url, {method: req.method, headers, body: payload}), env, {});
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
  return true;
}
