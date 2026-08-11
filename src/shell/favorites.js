// Favorites sync — dual-write (local localforage + server) with login merge.
// Local: localforage "likedsidset" (Set of sids)
// Server: profiles.favorites (JSON array of sids)
// On login: merge local → server (union). On load when logged in: fetch server, merge with local.

import { api } from "./api.js";

// Get the local favorites Set from localforage
export async function getLocalFavorites() {
  if (!window.localforage) return new Set();
  return new Promise((resolve) => {
    localforage.getItem("likedsidset", (err, val) => {
      resolve(val instanceof Set ? val : new Set(val || []));
    });
  });
}

// Save the local favorites Set to localforage
export async function saveLocalFavorites(set) {
  if (!window.localforage) return;
  return new Promise((resolve) => {
    localforage.setItem("likedsidset", set, () => resolve());
  });
}

// Get the merged favorites (server + local) when logged in; local only when not.
export async function getFavorites() {
  const local = await getLocalFavorites();
  if (!api.isLoggedIn()) return local;
  try {
    const serverSids = await api.getMyFavorites();
    if (Array.isArray(serverSids)) {
      const merged = new Set([...local, ...serverSids]);
      return merged;
    }
  } catch {}
  return local;
}

// Add a favorite: write to local + server (if logged in)
export async function addFavorite(sid) {
  const local = await getLocalFavorites();
  local.add(sid);
  await saveLocalFavorites(local);
  if (api.isLoggedIn()) {
    try { await api.saveMyFavorites(Array.from(local)); } catch {}
  }
  return local;
}

// Remove a favorite: write to local + server (if logged in)
export async function removeFavorite(sid) {
  const local = await getLocalFavorites();
  local.delete(sid);
  await saveLocalFavorites(local);
  if (api.isLoggedIn()) {
    try { await api.saveMyFavorites(Array.from(local)); } catch {}
  }
  return local;
}

// Merge local favorites into server (call on login)
export async function syncFavoritesOnLogin() {
  if (!api.isLoggedIn()) return;
  const local = await getLocalFavorites();
  try {
    const serverSids = await api.getMyFavorites();
    const server = new Set(Array.isArray(serverSids) ? serverSids : []);
    const merged = new Set([...local, ...server]);
    if (merged.size !== server.size) {
      await api.saveMyFavorites(Array.from(merged));
    }
    // also update local with the merged set
    await saveLocalFavorites(merged);
  } catch {}
}