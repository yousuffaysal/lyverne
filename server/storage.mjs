// Supabase Storage behind the R2 bucket interface server/worker.mjs already
// uses: put(key, buffer, {httpMetadata}) and get(key) -> {body, httpMetadata}.
//
// Implementing the existing shape keeps the upload endpoint's validation -- the
// 5MB ceiling, the MIME allow-list and the magic-byte check -- exactly as
// written and tested, with only the destination swapped.
//
// Images are proxied through /media/<key> on our own domain rather than linking
// the Supabase CDN directly. Two reasons: product image URLs stay on the brand
// domain, which is what gets credited in Google Images; and the storage host
// can change later without rewriting every product row.

const BUCKET = 'product-images';

const TYPES = {png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp'};
const typeFor = key => TYPES[key.split('.').pop()] || 'application/octet-stream';

export function createStorage(env) {
  const base = env.SUPABASE_URL;
  const secret = env.SUPABASE_SECRET_KEY;
  if (!base || !secret) return null; // uploads stay switched off, /api/config reports it

  const auth = {apikey: secret, Authorization: 'Bearer ' + secret};

  return {
    async put(key, buffer, options = {}) {
      const contentType = options.httpMetadata?.contentType || typeFor(key);
      const res = await fetch(`${base}/storage/v1/object/${BUCKET}/${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: {...auth, 'Content-Type': contentType, 'cache-control': 'max-age=31536000'},
        body: buffer,
      });
      if (!res.ok) throw new Error(`storage upload failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
      return {key};
    },

    async get(key) {
      const res = await fetch(`${base}/storage/v1/object/${BUCKET}/${encodeURIComponent(key)}`, {headers: auth});
      if (!res.ok) return null;
      return {
        body: res.body,
        httpMetadata: {contentType: res.headers.get('content-type') || typeFor(key)},
      };
    },

    async delete(key) {
      const res = await fetch(`${base}/storage/v1/object/${BUCKET}/${encodeURIComponent(key)}`, {
        method: 'DELETE', headers: auth,
      });
      return res.ok;
    },
  };
}
