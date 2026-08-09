// Beatmap Mirror API helper — leverages catboy.best / dev.catboy.best docs (api-1.json)
// Covers: search, beatmapsets by ids, beatmap by ID, beatmapset by ID, download .osz/.osu
// All via https, proxied or direct. Used for smoother menus (cached) + randomize + detail.
const CATBOY = "https://catboy.best";
const DEV = "https://dev.catboy.best";

export async function searchBeatmaps({ q = "", limit = 24, offset = 0, status = "4", mode = "0" } = {}) {
  const p = new URLSearchParams({ q, limit, offset, mode });
  // status can be single or array
  const statuses = Array.isArray(status) ? status : [status];
  statuses.forEach(s => p.append("status", String(s)));
  const url = `${CATBOY}/api/v2/search?${p}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`search ${r.status}`);
  return r.json();
}

export async function getBeatmapsetsByIds(ids) {
  if (!ids || !ids.length) return [];
  const r = await fetch(`${CATBOY}/api/v2/beatmapsets?ids=${ids.join("&ids=")}`);
  if (!r.ok) throw new Error(`sets ${r.status}`);
  return r.json();
}

export async function getBeatmapById(id, host = CATBOY) {
  const r = await fetch(`${host}/b/${id}`);
  if (!r.ok) throw new Error(`beatmap ${id} ${r.status}`);
  return r.json();
}

export async function getBeatmapSetById(id, host = CATBOY) {
  // dev API uses /s/{id}, catboy /api/v2/beatmapsets?ids=
  try {
    const r = await fetch(`${host}/s/${id}`);
    if (r.ok) return r.json();
  } catch {}
  // fallback to v2
  const sets = await getBeatmapsetsByIds([id]);
  return sets[0] || null;
}

export async function downloadOsz(setId, { noVideo = true, host = CATBOY } = {}) {
  const suffix = noVideo ? "n" : "";
  const url = `${host}/d/${setId}${suffix}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download ${setId} ${r.status}`);
  return r.blob();
}

export async function downloadOsu(beatmapId, host = DEV) {
  const r = await fetch(`${host}/osu/${beatmapId}`);
  if (!r.ok) throw new Error(`osu ${beatmapId} ${r.status}`);
  return r.text(); // .osu file content
}

// Random beatmaps helper — uses search with random offset for diversity
export function randomSearchUrl({ limit = 6 } = {}) {
  const offset = Math.floor(Math.random() * 800);
  return `${CATBOY}/api/v2/search?q=&limit=${limit}&offset=${offset}&status=1&status=3&status=4&mode=0`;
}
