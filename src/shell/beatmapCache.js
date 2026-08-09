// ponytail: in-memory cache, no TTL — manual reload clears
const cache = new Map();
const k = (o) => o.sids?.length ? `sids:${[...o.sids].sort().join(",")}|${o.limit}` : `src:${o.src}|${o.limit}`;
export const getCachedBeatmaps = (o) => cache.get(k(o)) || null;
export const setCachedBeatmaps = (o, d) => cache.set(k(o), Array.isArray(d) ? [...d] : d);
export const clearCachedBeatmaps = (o) => o ? cache.delete(k(o)) : cache.clear();
