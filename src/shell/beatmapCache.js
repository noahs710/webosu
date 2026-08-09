// Simple in-memory cache for beatmap listings. Keeps results for the SPA session
// until a manual reload is requested. Makes category navigation instant for
// rarely-changing lists (Browse/Hot/New/Liked/History) while still allowing
// search and other dynamic queries to be cached per-URL.
const cache = new Map();

function keyForSrc(src, limit) {
  return `src:${src}|limit:${limit ?? ""}`;
}
function keyForSids(sids, limit) {
  // sids order shouldn't matter for cache key, so sort
  const sorted = [...sids].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
  return `sids:${sorted.join(",")}|limit:${limit ?? ""}`;
}

export function getCachedBeatmaps({ src, sids, limit }) {
  const key = sids && sids.length ? keyForSids(sids, limit) : keyForSrc(src, limit);
  return cache.get(key) || null;
}

export function setCachedBeatmaps({ src, sids, limit }, data) {
  const key = sids && sids.length ? keyForSids(sids, limit) : keyForSrc(src, limit);
  // store a shallow copy to avoid external mutation
  cache.set(key, Array.isArray(data) ? [...data] : data);
}

export function clearCachedBeatmaps(opts) {
  if (!opts) { cache.clear(); return; }
  const key = opts.sids && opts.sids.length ? keyForSids(opts.sids, opts.limit) : keyForSrc(opts.src, opts.limit);
  cache.delete(key);
}
